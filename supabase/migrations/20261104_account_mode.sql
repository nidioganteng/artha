-- Migrasi: Mode Akun dan Kontributor
-- Jalankan di Supabase SQL Editor.
-- Idempoten: aman dijalankan lebih dari sekali.

-- ─── a) Tabel profiles ────────────────────────────────────────────────────────
-- Satu baris per user. id = user_id (PK = FK ke auth.users, 1:1).
-- Kolom user_id ditambahkan agar RLS policy "user_id = auth.uid()" konsisten
-- dengan pola tabel lain dan agar store (yang selalu menambah user_id ke row)
-- tidak mendapat error "column does not exist".

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  user_id     uuid not null    references auth.users(id) on delete cascade,
  mode        text not null default 'lengkap'
              check (mode in ('lengkap', 'investasi')),
  mode_locked boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;

drop policy if exists "profiles: user select"  on public.profiles;
drop policy if exists "profiles: user insert"  on public.profiles;
drop policy if exists "profiles: user update"  on public.profiles;
drop policy if exists "profiles: user delete"  on public.profiles;

create policy "profiles: user select"
  on public.profiles for select
  using (user_id = auth.uid());

create policy "profiles: user insert"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "profiles: user update"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profiles: user delete"
  on public.profiles for delete
  using (user_id = auth.uid());

-- Backfill: buat baris profiles untuk user yang sudah ada.
-- id = user_id karena ini hubungan 1:1.
insert into public.profiles (id, user_id, mode, mode_locked)
  select id, id, 'lengkap', false
  from auth.users
  on conflict do nothing;

-- ─── b) Trigger: buat profil otomatis saat user baru daftar ─────────────────
-- Trigger terpisah dari seed_new_user agar tidak mengubah logika yang sudah ada.

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  -- Baca mode dari metadata pendaftaran; default 'lengkap' jika tidak ada / nilai salah.
  v_mode := new.raw_user_meta_data->>'mode';
  if v_mode not in ('lengkap', 'investasi') then
    v_mode := 'lengkap';
  end if;

  insert into public.profiles (id, user_id, mode, mode_locked)
  values (new.id, new.id, v_mode, false)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- ─── c) Tabel contributors ───────────────────────────────────────────────────

create table if not exists public.contributors (
  id         uuid primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.contributors enable row level security;

drop policy if exists "contributors: user select" on public.contributors;
drop policy if exists "contributors: user insert" on public.contributors;
drop policy if exists "contributors: user update" on public.contributors;
drop policy if exists "contributors: user delete" on public.contributors;

create policy "contributors: user select"
  on public.contributors for select
  using (user_id = auth.uid());

create policy "contributors: user insert"
  on public.contributors for insert
  with check (user_id = auth.uid());

create policy "contributors: user update"
  on public.contributors for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "contributors: user delete"
  on public.contributors for delete
  using (user_id = auth.uid());

create index if not exists contributors_user_id_idx on public.contributors (user_id);

-- ─── d) Tambah contributor_id ke trades ──────────────────────────────────────

alter table public.trades
  add column if not exists contributor_id uuid
  references public.contributors(id) on delete set null;

create index if not exists trades_contributor_id_idx on public.trades (contributor_id);
