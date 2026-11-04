-- Budget per kategori (pengeluaran bulanan)
create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  amount      numeric(15,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, category_id)
);
alter table budgets enable row level security;
drop policy if exists "user own budgets" on budgets;
create policy "user own budgets" on budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Transfer antar rekening: kolom penghubung dua sisi transfer
alter table transactions add column if not exists transfer_pair_id uuid null;
