-- =====================================================================
-- Artha: skema database Supabase (Postgres)
-- Cara pakai: Supabase Dashboard > SQL Editor > New query > tempel > Run
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Rekening / dompet ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'bank' check (type in ('cash','bank','ewallet')),
  opening_balance numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Kategori pemasukan / pengeluaran ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  created_at timestamptz not null default now()
);

-- ---------- Transaksi (pemasukan & pengeluaran) ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),   -- boleh dibuat client (offline)
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  kind text not null check (kind in ('income','expense')),
  amount numeric(18,2) not null check (amount > 0),
  note text,
  occurred_on date not null default current_date,
  recurring_rule_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions(user_id, occurred_on desc);

-- ---------- Aturan berulang (gaji, tagihan, DCA bulanan, dst) ----------
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense','invest')),
  amount numeric(18,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Checklist bulanan: satu baris = satu aturan sudah "selesai" di bulan tertentu
create table if not exists public.recurring_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  month date not null,                              -- selalu tanggal 1 bulan tsb
  paid_at timestamptz not null default now(),
  transaction_id uuid references public.transactions(id) on delete set null,
  unique (rule_id, month)
);

-- ---------- Investasi ----------
-- Platform = tempat kamu menyimpan aset (Floq, BRI, dst)
create table if not exists public.platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Aset = apa yang dibeli (BTC, Emas, ...). price_source menentukan asal harga pasar.
--   'indodax' : harga live dari ticker publik Indodax, price_ref contoh 'btcidr'
--   'manual'  : harga diisi sendiri (manual_price), cocok untuk emas BRI
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null,
  asset_type text not null default 'other' check (asset_type in ('crypto','gold','stock','fund','other')),
  unit text not null default 'unit',
  price_source text not null default 'manual' check (price_source in ('indodax','manual')),
  price_ref text,
  manual_price numeric(24,2),
  manual_price_at timestamptz,
  created_at timestamptz not null default now()
);

-- Riwayat harga aset per tanggal — dipakai untuk grafik perkembangan portofolio.
-- source: 'live' = diambil dari /api/prices saat buka halaman,
--         'manual' = diisi user, 'history' = backfill dari sumber lain.
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
create index if not exists price_snapshots_asset_date_idx
  on public.price_snapshots (asset_id, date);

-- Setiap pembelian DCA / penjualan adalah satu baris trade
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  platform_id uuid references public.platforms(id) on delete set null,
  account_id uuid references public.accounts(id) on delete restrict,
  side text not null default 'buy' check (side in ('buy','sell')),
  quantity numeric(28,10) not null check (quantity > 0),
  price_per_unit numeric(24,2) not null check (price_per_unit >= 0),
  fee numeric(18,2) not null default 0 check (fee >= 0),
  traded_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
-- Idempotent: tambahkan kolom bila tabel sudah ada sebelum fitur ledger
alter table public.trades add column if not exists account_id uuid references public.accounts(id) on delete restrict;
create index if not exists trades_user_asset_idx on public.trades(user_id, asset_id, traded_on);
create index if not exists trades_account_id_idx on public.trades(account_id);

-- Kolom trade_id: transaksi yang dibuat otomatis saat mencatat DCA/jual investasi.
-- ON DELETE CASCADE: ketika trade dihapus, transaksi tautannya ikut terhapus di server.
alter table public.transactions add column if not exists trade_id uuid references public.trades(id) on delete cascade;
create index if not exists transactions_trade_id_idx on public.transactions(trade_id);

-- ---------- Row Level Security: setiap user hanya melihat datanya sendiri ----------
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','recurring_rules',
    'recurring_checks','platforms','assets','trades','price_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- Data awal otomatis untuk user baru ----------
create or replace function public.seed_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (user_id, name, type) values
    (new.id, 'Kas', 'cash'),
    (new.id, 'BRI', 'bank');

  insert into public.categories (user_id, name, kind) values
    (new.id, 'Gaji', 'income'),
    (new.id, 'Proyek / Freelance', 'income'),
    (new.id, 'Lainnya', 'income'),
    (new.id, 'Makan', 'expense'),
    (new.id, 'Transportasi', 'expense'),
    (new.id, 'Tagihan', 'expense'),
    (new.id, 'Kuliah', 'expense'),
    (new.id, 'Hiburan', 'expense'),
    (new.id, 'Lainnya', 'expense');

  insert into public.platforms (user_id, name) values
    (new.id, 'Floq'),
    (new.id, 'BRI');

  insert into public.assets (user_id, symbol, name, asset_type, unit, price_source, price_ref) values
    (new.id, 'BTC', 'Bitcoin', 'crypto', 'BTC', 'indodax', 'btcidr'),
    (new.id, 'EMAS', 'Emas', 'gold', 'gram', 'manual', null);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_new_user();
