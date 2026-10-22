-- Run once in your project's Supabase SQL Editor. No personal records included.
create table if not exists public.study_snapshots (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.study_snapshots enable row level security;
revoke all on public.study_snapshots from anon, authenticated;
grant select, insert, update on public.study_snapshots to authenticated;
drop policy if exists owner_read on public.study_snapshots;
drop policy if exists owner_insert on public.study_snapshots;
drop policy if exists owner_update on public.study_snapshots;
create policy owner_read on public.study_snapshots for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_insert on public.study_snapshots for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy owner_update on public.study_snapshots for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create or replace function public.save_study_snapshot(payload jsonb, expected_revision integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare next_revision integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if expected_revision < 0 or expected_revision is null then raise exception 'Invalid revision'; end if;
  if expected_revision = 0 then
    insert into public.study_snapshots(owner_id, data, revision)
    values(auth.uid(), payload, 1) on conflict do nothing returning revision into next_revision;
  else
    update public.study_snapshots set data = payload, revision = revision + 1, updated_at = now()
    where owner_id = auth.uid() and revision = expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Records changed on another device. Reload before saving.'; end if;
  return next_revision;
end;
$$;
revoke all on function public.save_study_snapshot(jsonb, integer) from public, anon;
grant execute on function public.save_study_snapshot(jsonb, integer) to authenticated;
