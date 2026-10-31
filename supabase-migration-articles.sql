-- Puck Bunker: Articles
--
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- It's safe to run again; it only creates what's missing.
--
-- Creates the puckbunker_articles table that the Admin page's Articles tab
-- writes to and the Articles page reads from.
--
-- Who can do what (Row Level Security):
--   • Anyone visiting the site can read PUBLISHED articles, and nothing else.
--   • Logged-in admins can create, edit, publish and delete articles. Admin
--     accounts are the ones in Supabase → Authentication → Users; the site has
--     no public sign-up, so every logged-in account is an admin.
--
-- Cover and in-article images go in the existing "report-thumbnails" storage
-- bucket, under an articles/ folder, so no new bucket is needed.

create table if not exists public.puckbunker_articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,          -- the /article/<slug> address; set once, never changed after publishing
  title         text not null default '',
  dek           text not null default '',      -- one- or two-sentence summary shown on cards and link previews
  body          text not null default '',      -- the article, in the admin editor's simple formatting (Markdown)
  cover_url     text,
  tags          text[] not null default '{}',
  author_name   text not null default '',
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  scheduled_at  timestamptz,
  published_at  timestamptz,                   -- set the first time it goes live; used for ordering and the date shown
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists puckbunker_articles_status_published_idx
  on public.puckbunker_articles (status, published_at desc);

-- Keep updated_at current on every edit.
create or replace function public.puckbunker_articles_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists puckbunker_articles_touch on public.puckbunker_articles;
create trigger puckbunker_articles_touch
  before update on public.puckbunker_articles
  for each row execute function public.puckbunker_articles_touch();

alter table public.puckbunker_articles enable row level security;

drop policy if exists "Public reads published articles" on public.puckbunker_articles;
create policy "Public reads published articles"
  on public.puckbunker_articles for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins read all articles" on public.puckbunker_articles;
create policy "Admins read all articles"
  on public.puckbunker_articles for select
  to authenticated
  using (true);

drop policy if exists "Admins add articles" on public.puckbunker_articles;
create policy "Admins add articles"
  on public.puckbunker_articles for insert
  to authenticated
  with check (true);

drop policy if exists "Admins edit articles" on public.puckbunker_articles;
create policy "Admins edit articles"
  on public.puckbunker_articles for update
  to authenticated
  using (true) with check (true);

drop policy if exists "Admins delete articles" on public.puckbunker_articles;
create policy "Admins delete articles"
  on public.puckbunker_articles for delete
  to authenticated
  using (true);

-- Let the website reach the table. Newer Supabase projects don't grant this
-- automatically for tables made in the SQL Editor; the policies above still
-- decide which rows each visitor can see or change.
grant select on public.puckbunker_articles to anon;
grant select, insert, update, delete on public.puckbunker_articles to authenticated;
