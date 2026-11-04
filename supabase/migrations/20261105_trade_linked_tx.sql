-- Tambahkan kolom trade_id ke transactions
-- Transaksi yang dibuat otomatis saat mencatat DCA/jual investasi akan punya
-- kolom ini terisi. ON DELETE CASCADE: hapus trade = hapus transaksi tautannya.

alter table public.transactions
  add column if not exists trade_id uuid references public.trades(id) on delete cascade;

create index if not exists transactions_trade_id_idx on public.transactions(trade_id);
