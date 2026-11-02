-- Jalankan di Supabase SQL Editor sebelum deploy kode ini.
-- File ini idempotent: aman dijalankan lebih dari sekali.

-- Tambah kolom sumber dana ke trades
alter table trades add column if not exists account_id uuid references accounts(id) on delete restrict;

-- Tambah saldo awal ke rekening
alter table accounts add column if not exists opening_balance numeric not null default 0;

-- Indeks performa
create index if not exists trades_account_id_idx on trades(account_id);
