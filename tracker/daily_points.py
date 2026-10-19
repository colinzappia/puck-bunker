#!/usr/bin/env python3
"""Puck Bunker daily points: OHL, WHL, QMJHL and USHL (incl. NTDP).

For each date asked for, this script:
  1. reads each league's schedule (HockeyTech "scorebar" feed),
  2. opens the official game summary of every final game,
  3. records points by tracked skaters and goalie games with 2 or fewer goals against,
  4. merges the results into data/points.json (one entry per date, safe to re-run).

Usage:
  python daily_points.py                      # yesterday (America/Toronto)
  python daily_points.py --date 2026-10-18
  python daily_points.py --start 2026-10-13 --end 2026-10-18

Only the Python standard library is needed (Python 3.9+).
"""
import argparse
import datetime as dt
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
PLAYERS_FILE = ROOT / "players.json"
OUT_FILE = ROOT / "data" / "points.json"
TZ = ZoneInfo("America/Toronto")

FEED = "https://lscluster.hockeytech.com/feed/index.php"
# Public keys that the leagues' own websites use for their scoreboards.
LEAGUES = {
    "OHL":   {"client_code": "ohl",   "key": "f1aa699db3d81487"},
    "WHL":   {"client_code": "whl",   "key": "f1aa699db3d81487"},
    "QMJHL": {"client_code": "lhjmq", "key": "f1aa699db3d81487"},
    "USHL":  {"client_code": "ushl",  "key": "e828f89b243dc43f"},
}
GOALIE_MAX_GA = 2


# ---------------------------------------------------------------- helpers
def norm(name):
    """Lower-case, strip accents and punctuation: 'Héroux' -> 'heroux'."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z ]", "", s.replace("-", " ")).strip()


def get_json(params, retries=3):
    url = FEED + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "PuckBunker-points/1.0"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode("utf-8").strip()
            # Some feeds answer as JSONP: "( {...} )"
            if text.startswith("(") and text.endswith(")"):
                text = text[1:-1]
            return json.loads(text)
        except Exception as e:  # network hiccup or rate limit
            if attempt == retries - 1:
                raise RuntimeError(f"Could not read {url}: {e}") from e
            time.sleep(3 * (attempt + 1))


def last_name(full):
    parts = [w for w in full.split() if w.lower().rstrip(".") not in ("jr", "sr", "ii", "iii")]
    return norm(parts[-1]) if parts else ""


def load_players():
    data = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    by_league = {}
    for p in data["players"]:
        idx = by_league.setdefault(p["league"], {"by_id": {}, "by_name": {}})
        if p.get("ht_id"):
            idx["by_id"][int(p["ht_id"])] = p
        for n in [p["name"], *p.get("aliases", [])]:
            idx["by_name"][norm(n)] = p
    return by_league


def match(idx, person):
    """Find a tracked player from a feed player object {id, firstName, lastName}."""
    if not person:
        return None
    pid = person.get("id")
    if pid is not None and int(pid) in idx["by_id"]:
        return idx["by_id"][int(pid)]
    return idx["by_name"].get(norm(f'{person.get("firstName", "")} {person.get("lastName", "")}'))


# ---------------------------------------------------------------- feeds
def games_on(league, day):
    """Final games played on `day` (a date), from the scorebar feed.

    numberofdaysahead must NOT be 0: with 0 the feed can drop the most recent
    day. We ask for a wide window and filter on GameDateISO8601 ourselves.
    """
    cfg = LEAGUES[league]
    today = dt.datetime.now(TZ).date()
    back = max((today - day).days + 1, 1)
    data = get_json({
        "feed": "modulekit", "view": "scorebar", "client_code": cfg["client_code"],
        "key": cfg["key"], "numberofdaysback": back, "numberofdaysahead": 2,
        "fmt": "json", "lang": "en",
    })
    out = []
    for g in data.get("SiteKit", {}).get("Scorebar", []):
        iso = g.get("GameDateISO8601") or ""
        if iso[:10] != day.isoformat():
            continue
        status = (g.get("GameStatusString") or "") + " " + (g.get("GameStatusStringLong") or "")
        if "final" not in status.lower():
            continue
        out.append(g)
    return out


def game_summary(league, game_id):
    cfg = LEAGUES[league]
    return get_json({
        "feed": "statviewfeed", "view": "gameSummary", "game_id": game_id,
        "key": cfg["key"], "site_id": 0, "client_code": cfg["client_code"],
        "lang": "en", "league_id": "",
    })


# ---------------------------------------------------------------- parsing
def team_label(team_info):
    return team_info.get("city") or team_info.get("name") or team_info.get("abbreviation") or ""


def parse_game(league, sb, summary, idx, day):
    """Return (points, goalies) for one game. `sb` is the scorebar row."""
    home_id, vis_id = str(sb.get("HomeID")), str(sb.get("VisitorID"))
    home_name, vis_name = sb.get("HomeCity", ""), sb.get("VisitorCity", "")
    score = f'{sb.get("VisitorCode", "")} {sb.get("VisitorGoals")} @ {sb.get("HomeCode", "")} {sb.get("HomeGoals")}'

    def opp_for(team_id):
        return f"vs {vis_name}" if str(team_id) == home_id else f"@ {home_name}"

    tally = {}  # player name -> dict
    for period in summary.get("periods") or []:
        for goal in period.get("goals") or []:
            team = goal.get("team") or {}
            people = [(goal.get("scoredBy"), "g")] + [(a, "a") for a in (goal.get("assists") or [])]
            for person, kind in people:
                p = match(idx, person)
                if not p or p.get("pos") == "G":
                    continue
                row = tally.setdefault(p["name"], {
                    "date": day.isoformat(), "player": p["name"], "team": p["team"],
                    "league": league, "opponent": opp_for(team.get("id")),
                    "g": 0, "a": 0, "game_id": sb.get("ID"), "score": score,
                    "source": "hockeytech", "confidence": "official",
                })
                row[kind] += 1
    points = list(tally.values())

    goalies = []
    for side, opp in (("homeTeam", f"vs {vis_name}"), ("visitingTeam", f"@ {home_name}")):
        for gk in (summary.get(side) or {}).get("goalies") or []:
            p = match(idx, gk.get("info"))
            st = gk.get("stats") or {}
            if not p or not st.get("shotsAgainst"):
                continue  # not tracked, or did not play
            ga = int(st.get("goalsAgainst") or 0)
            goalies.append({
                "date": day.isoformat(), "goalie": p["name"], "team": p["team"], "league": league,
                "opponent": opp, "shots": int(st.get("shotsAgainst") or 0),
                "saves": int(st.get("saves") or 0), "ga": ga, "toi": st.get("timeOnIce"),
                "qualifies": ga <= GOALIE_MAX_GA, "game_id": sb.get("ID"), "score": score,
                "source": "hockeytech", "confidence": "official",
            })
    return points, goalies


# ---------------------------------------------------------------- main
def run_day(day, players, log):
    points, goalies, games = [], [], []
    for league in LEAGUES:
        idx = players.get(league)
        if not idx:
            continue
        try:
            sched = games_on(league, day)
        except RuntimeError as e:
            log.append(f"{league}: schedule unavailable ({e})")
            continue
        for sb in sched:
            try:
                summ = game_summary(league, sb["ID"])
            except RuntimeError as e:
                log.append(f'{league} game {sb.get("ID")}: summary unavailable ({e})')
                continue
            p, g = parse_game(league, sb, summ, idx, day)
            points += p
            goalies += g
            games.append({"league": league, "game_id": sb.get("ID"),
                          "matchup": f'{sb.get("VisitorCode")} @ {sb.get("HomeCode")}'})
            time.sleep(0.5)  # be polite to the feed
    points.sort(key=lambda r: (-(r["g"] + r["a"]), -r["g"], last_name(r["player"])))
    return {"date": day.isoformat(), "points": points, "goalies": goalies,
            "games_checked": games, "updated": dt.datetime.now(TZ).isoformat(timespec="seconds")}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", help="single date YYYY-MM-DD (default: yesterday, Toronto time)")
    ap.add_argument("--start", help="first date of a range YYYY-MM-DD")
    ap.add_argument("--end", help="last date of a range YYYY-MM-DD (default: --start)")
    args = ap.parse_args()

    if args.start:
        start = dt.date.fromisoformat(args.start)
        end = dt.date.fromisoformat(args.end) if args.end else start
    else:
        start = end = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(TZ).date() - dt.timedelta(days=1)

    players = load_players()
    store = json.loads(OUT_FILE.read_text(encoding="utf-8")) if OUT_FILE.exists() else {"days": {}}
    log = []
    day = start
    while day <= end:
        result = run_day(day, players, log)
        # Keep rows from the other sources (europe_points.py, manual entries); replace only our own.
        old = store["days"].get(day.isoformat(), {})
        for key in ("points", "goalies"):
            kept = [r for r in old.get(key, []) if r.get("source", "manual") != "hockeytech"]
            result[key] = result[key] + kept
        result["points"].sort(key=lambda r: (-(r["g"] + r["a"]), -r["g"], last_name(r["player"])))
        store["days"][day.isoformat()] = result
        print(f'{day}: {len(result["games_checked"])} games, {len(result["points"])} players with points, '
              f'{sum(g["qualifies"] for g in result["goalies"])} goalie games with <= {GOALIE_MAX_GA} GA')
        day += dt.timedelta(days=1)

    store["updated"] = dt.datetime.now(TZ).isoformat(timespec="seconds")
    store.setdefault("problems", {})
    if isinstance(store["problems"], list):
        store["problems"] = {}
    store["problems"]["hockeytech"] = log
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")
    for line in log:
        print("WARNING:", line, file=sys.stderr)


if __name__ == "__main__":
    main()
