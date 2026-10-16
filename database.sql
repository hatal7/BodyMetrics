-- BodyMetrics: uruchom w Supabase SQL Editor w osobnym projekcie.
-- Wymaga włączonego Supabase Auth (Email).
create extension if not exists pgcrypto;

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null,
  weight numeric(6,1) check (weight > 0 and weight <= 500),
  waist numeric(6,1) check (waist > 0 and waist <= 300),
  hips numeric(6,1) check (hips > 0 and hips <= 300),
  chest numeric(6,1) check (chest > 0 and chest <= 300),
  thigh numeric(6,1) check (thigh > 0 and thigh <= 200),
  arm numeric(6,1) check (arm > 0 and arm <= 150),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint measurements_one_per_day unique (user_id, measured_at),
  constraint measurements_one_value check (
    weight is not null or waist is not null or hips is not null or
    chest is not null or thigh is not null or arm is not null
  )
);

create index if not exists measurements_user_date_idx
  on public.measurements (user_id, measured_at desc);

alter table public.measurements enable row level security;

-- Każda operacja ograniczona do zalogowanego właściciela.
drop policy if exists "measurements_select_own" on public.measurements;
create policy "measurements_select_own" on public.measurements
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "measurements_insert_own" on public.measurements;
create policy "measurements_insert_own" on public.measurements
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "measurements_update_own" on public.measurements;
create policy "measurements_update_own" on public.measurements
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "measurements_delete_own" on public.measurements;
create policy "measurements_delete_own" on public.measurements
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_measurement_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_measurement_updated_at on public.measurements;
create trigger trg_measurement_updated_at before update on public.measurements
for each row execute function public.set_measurement_updated_at();

revoke all on public.measurements from anon;
grant select, insert, update, delete on public.measurements to authenticated;
