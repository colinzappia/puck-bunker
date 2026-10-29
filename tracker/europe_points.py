#!/usr/bin/env python3
"""Puck Bunker daily points: Europe, Russia and NCAA (players in players_europe.json).

Uses up to three sources per player, best first, and labels every row with how sure it is:

  1. Elite Prospects official API game logs ("official")        - needs EP_API_KEY
     Per-game goals, assists, goals against and saves. Exact.
  2. Your manual entries in data/manual.json ("official")       - from the daily updates
  3. Elite Prospects public player pages ("single-game" or "probable")   *** OFF BY DEFAULT ***
     Elite Prospects blocks automated reads of its public pages (HTTP 403 from GitHub's
     servers) and this site has no API key, so this reader is switched off. Set the
     environment variable EP_PUBLIC_PAGES=1 to turn it back on.
     When on, the script saves each player's season totals every day and compares them with
     the previous day's. New points are pinned to a date only when exactly one game was
     played in between ("single-game", counted). Otherwise they're listed as
     "probable" with the possible dates and NOT counted in totals.

Rows from daily_points.py (OHL/WHL/QMJHL/USHL) are never touched.

Usage:
  python europe_points.py                  # API: yesterday + day before; public pages: since last run
  python europe_points.py --start 2026-10-13 --end 2026-10-18   # date range (API and manual only)
  python europe_points.py --debug-ep 1010942                    # save one public page for troubleshooting
"""
import argparse
import datetime as dt
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from daily_points import TZ, GOALIE_MAX_GA, OUT_FILE, last_name

ROOT = Path(__file__).resolve().parent
PLAYERS_FILE = ROOT / "players_europe.json"
MANUAL_FILE = ROOT / "data" / "manual.json"
SNAP_FILE = ROOT / "data" / "ep_snapshots.json"
API = "https://api.eliteprospects.com/v1"
SEASON_START_YEAR = 2026
UA = "Mozilla/5.0 (compatible; PuckBunker-points/1.0; +https://www.PuckBunker.com)"
# Public-page reading is OFF unless EP_PUBLIC_PAGES=1 (see the note at the top of this file).
USE_PUBLIC_PAGES = os.environ.get("EP_PUBLIC_PAGES", "").strip() == "1"
MY_SOURCES = {"ep_api", "ep_page", "manual"}
RANK = {"ep_api": 3, "manual": 2, "ep_page": 1}


# ------------------------------------------------------------------ io
def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def http_get(url, headers=None, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404) or attempt == retries - 1:
                return e.code, e.read().decode("utf-8", "replace") if e.fp else ""
        except Exception:
            if attempt == retries - 1:
                return 0, ""
        time.sleep(4 * (attempt + 1))


# ------------------------------------------------------------------ 1. official API
def api_game_logs(player, start, end, key):
    """Return (rows, problem) using GET /players/{id}/game-logs for start..end."""
    q = urllib.parse.urlencode({
        "game.date:from": start.isoformat(), "game.date:to": end.isoformat(), "limit": 100,
        "fields": "game.id,game.date,game.league,game.leagueName,teamName,opponentName,gameType,"
                  "teamScore,opponentScore,outcome,stats.G,stats.A,stats.GA,stats.SV,stats.SA",
    })
    status, body = http_get(f'{API}/players/{player["ep_id"]}/game-logs?{q}', {"X-Api-Key": key})
    if status != 200:
        return None, f'{player["name"]}: EP API returned {status or "no response"}'
    rows = []
    for gl in json.loads(body).get("data", []):
        g, st = gl.get("game") or {}, gl.get("stats") or {}
        league = (g.get("league") or {}).get("name") or g.get("leagueName") or player["league"]
        opp = ("vs " if gl.get("gameType") == "home" else "@ ") + (gl.get("opponentName") or "")
        base = {"date": g.get("date", "")[:10], "team": gl.get("teamName") or player["team"], "league": league,
                "opponent": opp, "score": f'{gl.get("outcome") or ""} {gl.get("teamScore")}-{gl.get("opponentScore")}'.strip(),
                "game_id": g.get("id"), "source": "ep_api", "confidence": "official"}
        if player.get("pos") == "G":
            if st.get("SA") is None and st.get("GA") is None:
                continue  # dressed but didn't play, or not recorded yet
            ga = int(st.get("GA") or 0)
            rows.append(("goalies", {**base, "goalie": player["name"], "shots": st.get("SA"), "saves": st.get("SV"),
                                     "ga": ga, "qualifies": ga <= GOALIE_MAX_GA}))
        elif (st.get("G") or 0) + (st.get("A") or 0) > 0:
            rows.append(("points", {**base, "player": player["name"], "g": int(st.get("G") or 0), "a": int(st.get("A") or 0)}))
    return rows, None


# ------------------------------------------------------------------ 3. public pages
def walk(node, path=()):
    """Yield (dict, ancestor_path) for every dict inside a JSON tree."""
    if isinstance(node, dict):
        yield node, path
        for k, v in node.items():
            yield from walk(v, path + (str(k),))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, path + (str(i),))


def _num(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def parse_public_page(page):
    """Best-effort: current-season lines {league: [GP, G, A]} and game dates listed on the page.

    EP pages are built with Next.js; the data sits in a <script id="__NEXT_DATA__"> JSON blob.
    Falls back to reading table rows. Returns (lines, dates, method).
    """
    lines, dates = {}, set()
    m = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if m:
        try:
            data = json.loads(m.group(1))
        except ValueError:
            data = None
        if data is not None:
            stack = []  # (dict, path) to look up season/league in ancestors
            for d, path in walk(data):
                low = {k.lower(): v for k, v in d.items()}
                # game log entries: a date plus an opponent
                if "date" in low and any("opponent" in k for k in low):
                    ds = str(low["date"])[:10]
                    if re.match(r"\d{4}-\d{2}-\d{2}$", ds):
                        dates.add(ds)
                # season stat lines: GP + G + A
                gp = _num(low.get("gp", low.get("gamesplayed")))
                g, a = _num(low.get("g", low.get("goals"))), _num(low.get("a", low.get("assists")))
                if gp is None or g is None or a is None:
                    continue
                pathtxt = " ".join(path).lower()
                if "project" in pathtxt or "playoff" in pathtxt or "postseason" in pathtxt or "career" in pathtxt:
                    continue
                # find the season + league on this dict or its parents
                parent = data
                ctx = [d]
                for key in path:
                    parent = parent[int(key)] if isinstance(parent, list) else parent.get(key)
                    if isinstance(parent, dict):
                        ctx.append(parent)
                season = league = None
                for c in reversed(ctx):
                    cl = {k.lower(): v for k, v in c.items()}
                    s = cl.get("season")
                    if season is None and s is not None:
                        season = s.get("startYear") or s.get("slug") if isinstance(s, dict) else s
                    lg = cl.get("league")
                    if league is None and lg is not None:
                        league = (lg.get("name") or lg.get("slug")) if isinstance(lg, dict) else lg
                    if "project" in json.dumps(cl.get("type", "")).lower():
                        season = "skip"
                if season is None or league is None or season == "skip":
                    continue
                if str(SEASON_START_YEAR) not in str(season):
                    continue
                lines[str(league)] = [gp, g, a]
            if lines:
                return lines, sorted(dates), "next_data"
    # Fallback: visible table rows like "2026-27 | MoDo Hockey U20 | U20 Nationell | 5 | 4 | 5 | 9"
    for tr in re.split(r"(?i)</tr\s*>", page):
        row = htmllib.unescape(re.sub(r"<[^>]+>", "|", tr))
        row = re.sub(r"\s*\|[\s|]*", "|", row).strip("| \n")
        if not re.match(rf"{SEASON_START_YEAR}-(\d\d|\d{{4}})\b", row) or "project" in row.lower():
            continue
        cells = [c.strip() for c in row.split("|") if c.strip()]
        nums = [i for i, c in enumerate(cells) if c.isdigit() or c == "-"]
        if len(nums) >= 3 and nums[0] >= 2:
            league = cells[nums[0] - 1]
            gp, g, a = (_num(cells[i]) for i in nums[:3])
            if None not in (gp, g, a):
                lines[league] = [gp, g, a]
    return lines, sorted(dates), "table" if lines else "failed"


def public_snapshot(player):
    status, page = http_get(f'https://www.eliteprospects.com/player/{player["ep_id"]}/x')
    if status != 200:
        return None, f'{player["name"]}: EP page returned {status or "no response"} (blocked or down)'
    lines, dates, method = parse_public_page(page)
    if not lines:
        return None, f'{player["name"]}: could not read season stats from the EP page (run --debug-ep {player["ep_id"]})'
    return {"lines": lines, "dates": dates, "method": method}, None


def public_deltas(player, prev, cur, today):
    """Compare yesterday's and today's season lines; return rows for new points."""
    rows = []
    if not prev:
        return rows  # first run: just remember the totals
    since = prev["taken"]
    for league, (gp, g, a) in cur["lines"].items():
        p_gp, p_g, p_a = prev["lines"].get(league, [0, 0, 0])
        dgp, dg, da = gp - p_gp, g - p_g, a - p_a
        if dg < 0 or da < 0 or dgp < 0:
            rows.append(("problems", f'{player["name"]} ({league}): totals went down ({p_gp}-{p_g}-{p_a} -> {gp}-{g}-{a})'))
            continue
        if dg + da == 0:
            continue
        # game dates listed on the page between the two snapshots
        cands = [d for d in cur["dates"] if since <= d < today.isoformat()]
        base = {"player": player["name"], "team": player["team"], "league": league, "g": dg, "a": da,
                "opponent": "", "source": "ep_page"}
        if dgp == 1 and len(cands) == 1:
            rows.append(("points", {**base, "date": cands[0], "confidence": "single-game"}))
        else:
            when = cands[-1] if cands else (today - dt.timedelta(days=1)).isoformat()
            why = (f"{dgp} new game{'s' if dgp != 1 else ''}" + (f"; possible dates {', '.join(cands)}" if cands else "; dates not listed")
                   + f" (since {since})")
            rows.append(("points", {**base, "date": when, "confidence": "probable", "note": why}))
    return rows


# ------------------------------------------------------------------ merge
def merge(store, new_rows, dates_replaced):
    """Rebuild this script's rows for `dates_replaced`; elsewhere, add new rows without
    overwriting a better source for the same player and date (ep_api > manual > ep_page)."""
    def who(r):
        return r.get("player") or r.get("goalie")

    for d in dates_replaced:
        day = store["days"].setdefault(d, {"date": d, "points": [], "goalies": [], "games_checked": []})
        for key in ("points", "goalies"):
            # ep_page rows can't be re-derived later (they come from day-to-day changes), so they stay
            day[key] = [r for r in day.get(key, []) if r.get("source", "manual") not in ("ep_api", "manual")]

    best = {}
    for key, r in new_rows:
        kk = (key, r["date"], who(r))
        cur = best.get(kk)
        if cur is None or RANK[r["source"]] > RANK[cur["source"]]:
            best[kk] = r
        elif r["source"] == cur["source"] == "ep_api" and r.get("game_id") != cur.get("game_id") and key == "points":
            cur["g"] += r["g"]; cur["a"] += r["a"]   # two games on one date (rare)

    for (key, d, name), r in best.items():
        day = store["days"].setdefault(d, {"date": d, "points": [], "goalies": [], "games_checked": []})
        same = [x for x in day[key] if who(x) == name]
        if any(x.get("source", "manual") == "hockeytech" or RANK.get(x.get("source", "manual"), 0) > RANK[r["source"]] for x in same):
            continue
        day[key] = [x for x in day[key] if who(x) != name] + [r]

    for day in store["days"].values():
        day["points"].sort(key=lambda r: (r.get("confidence") == "probable", -(r["g"] + r["a"]), -r["g"], last_name(r["player"])))


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start"); ap.add_argument("--end")
    ap.add_argument("--debug-ep", type=int, help="save one EP public page and show what was read from it")
    args = ap.parse_args()

    if args.debug_ep:
        status, page = http_get(f"https://www.eliteprospects.com/player/{args.debug_ep}/x")
        out = ROOT / f"debug_ep_{args.debug_ep}.html"
        out.write_text(page, encoding="utf-8")
        print(f"HTTP {status}, saved {len(page)} characters to {out.name}")
        print(json.dumps(parse_public_page(page), indent=1))
        return

    today = dt.datetime.now(TZ).date()
    yesterday = today - dt.timedelta(days=1)
    start = dt.date.fromisoformat(args.start) if args.start else yesterday - dt.timedelta(days=1)
    end = dt.date.fromisoformat(args.end) if args.end else (dt.date.fromisoformat(args.start) if args.start else yesterday)

    players = load(PLAYERS_FILE, {"players": []})["players"]
    store = load(OUT_FILE, {"days": {}})
    manual = load(MANUAL_FILE, {"points": [], "goalies": []})
    snaps = load(SNAP_FILE, {})
    key = os.environ.get("EP_API_KEY", "").strip()
    problems, rows = [], []
    dates_replaced = set()

    d = start
    while d <= end:
        dates_replaced.add(d.isoformat()); d += dt.timedelta(days=1)

    # 2. manual entries for the dates being rebuilt
    for kind in ("points", "goalies"):
        for r in manual.get(kind, []):
            if r.get("date") in dates_replaced:
                r = {**r, "source": "manual", "confidence": r.get("confidence", "official")}
                if kind == "goalies":
                    r.setdefault("qualifies", int(r.get("ga", 99)) <= GOALIE_MAX_GA)
                rows.append((kind, r))

    for p in players:
        if not p.get("ep_id"):
            continue
        got_api = False
        # 1. official API
        if key:
            api_rows, err = api_game_logs(p, start, end, key)
            if err:
                problems.append(err)
            else:
                rows += api_rows
                got_api = True
            time.sleep(0.3)
        # 3. public page, once per day, only when the API didn't cover this player.
        #    Goalies are skipped: public pages give GAA, not goals against per game.
        if USE_PUBLIC_PAGES and not got_api and not args.start and p.get("pos") != "G":
            prev = snaps.get(str(p["ep_id"]))
            if prev and prev.get("taken") == today.isoformat():
                continue  # already compared today
            cur, err = public_snapshot(p)
            if err:
                problems.append(err)
            else:
                for kind, r in public_deltas(p, prev, cur, today):
                    if kind == "problems":
                        problems.append(r)
                    else:
                        rows.append((kind, r)); dates_replaced.add(r["date"])
                snaps[str(p["ep_id"])] = {"taken": today.isoformat(), **cur}
            time.sleep(2.5)  # be gentle with the site

    merge(store, rows, sorted(dates_replaced))
    store.setdefault("problems", {})
    if isinstance(store["problems"], list):
        store["problems"] = {}
    store["problems"]["europe"] = problems
    store["updated"] = dt.datetime.now(TZ).isoformat(timespec="seconds")
    save(OUT_FILE, store)
    save(SNAP_FILE, snaps)
    counted = sum(1 for k, r in rows if k == "points" and r.get("confidence") != "probable")
    probable = sum(1 for k, r in rows if k == "points" and r.get("confidence") == "probable")
    print(f"Europe/NCAA: {counted} counted point lines, {probable} probable, {len(problems)} problems "
          f"({'API + ' if key else ''}public pages{' + manual' if manual.get('points') else ''})")
    for line in problems:
        print("WARNING:", line, file=sys.stderr)


if __name__ == "__main__":
    main()
