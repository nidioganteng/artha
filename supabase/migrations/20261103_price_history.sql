-- =====================================================================
-- Artha: migrasi price_snapshots (riwayat harga aset per tanggal)
-- Jalankan di Supabase SQL Editor SEBELUM deploy kode baru.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  date date not null,
  price numeric(24,2) not null,
  source text not null check (source in ('live','manual','history')),
  created_at timestamptz not null default now(),
  unique (user_id, asset_id, date)
);

alter table public.price_snapshots enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'price_snapshots'
      and policyname = 'price_snapshots: own rows'
  ) then
    create policy "price_snapshots: own rows"
      on public.price_snapshots for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create index if not exists price_snapshots_asset_date_idx
  on public.price_snapshots (asset_id, date);
