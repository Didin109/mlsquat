-- ML Squad database schema
create extension if not exists pgcrypto;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 40),
  ml_id text not null check (ml_id ~ '^[0-9]{3,24}$'),
  zone_id text not null check (zone_id ~ '^[0-9]{1,12}$'),
  category text not null check (category in ('like_exchange','looking_for_party')),
  like_target text,
  rank text,
  role text,
  note text not null default '' check (char_length(note) <= 240),
  status text not null default 'active' check (status in ('active','completed')),
  contact_email text,
  email_consent boolean not null default false,
  owner_token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_fields_check check (
    (category = 'like_exchange' and like_target is not null and rank is null and role is null)
    or
    (category = 'looking_for_party' and like_target is null and rank is not null and role is not null)
  ),
  constraint email_consent_check check (email_consent = false or contact_email is not null)
);

create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
create index if not exists community_posts_category_status_idx on public.community_posts (category, status);

alter table public.community_posts enable row level security;

-- Public can read community posts. All mutations should go through Edge Functions.
drop policy if exists "Public can read community posts" on public.community_posts;
create policy "Public can read community posts" on public.community_posts
for select to anon, authenticated using (true);

-- No public INSERT/UPDATE/DELETE policies: Edge Functions validate and use server credentials.
revoke insert, update, delete on public.community_posts from anon, authenticated;
grant select on public.community_posts to anon, authenticated;

-- Keep contact email and owner hash private: never expose them through public table SELECT.
-- A safer production deployment should separate public feed data from private contact data.
-- This view intentionally contains only public fields.
create or replace view public.community_posts_public
with (security_invoker = true) as
select id,nickname,ml_id,zone_id,category,like_target,rank,role,note,status,created_at,updated_at
from public.community_posts;

grant select on public.community_posts_public to anon, authenticated;

-- Scheduled cleanup: remove posts older than 7 days, but never delete the two newest posts.
create or replace function public.cleanup_old_community_posts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_count integer := 0;
begin
  with ranked as (
    select id, created_at,
      row_number() over (order by created_at desc, id desc) as rn
    from public.community_posts
  ),
  doomed as (
    select id from ranked
    where rn > 2 and created_at < now() - interval '7 days'
  ),
  deleted as (
    delete from public.community_posts p
    using doomed d
    where p.id = d.id
    returning p.id
  )
  select count(*) into removed_count from deleted;

  return jsonb_build_object('deleted_count', removed_count, 'executed_at', now());
end;
$$;

revoke all on function public.cleanup_old_community_posts() from public, anon, authenticated;
grant execute on function public.cleanup_old_community_posts() to postgres;

-- Optional: enable pg_cron in Supabase Dashboard > Database > Extensions first.
-- Then run this block. The schedule is every 7 days (604800 seconds).
-- select cron.schedule(
--   'ml-squad-weekly-cleanup',
--   '0 3 */7 * *',
--   $$select public.cleanup_old_community_posts();$$
-- );
