-- Uruchom w SQL Editor projektu BodyMetrics.
-- Zachowuje istniejące tabele i pomiary.
-- Login jest przechowywany oddzielnie, bez udostępniania adresu e-mail.
create table if not exists public.account_logins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,30}$')
);

create unique index if not exists account_logins_username_lower_uidx
  on public.account_logins ((lower(username)));

alter table public.account_logins enable row level security;
revoke all on public.account_logins from anon, authenticated;
-- Odczyt tabeli odbywa się WYŁĄCZNIE w Edge Function przy użyciu
-- service_role, którego NIGDY nie umieszczamy w plikach strony.

-- Login ustawiony: mateusz.
-- UID nowego konta został podany przez właściciela projektu.
insert into public.account_logins (user_id, username)
values ('bc0e419b-660d-4757-b081-01024f3f403c', 'mateusz')
on conflict (user_id) do update set username = excluded.username;
