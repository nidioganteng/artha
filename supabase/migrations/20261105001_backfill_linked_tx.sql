-- Backfill: buat transaksi tautannya untuk catatan DCA yang sudah ada sebelum
-- fitur linked tx ditambahkan. Hanya untuk trade yang punya account_id dan
-- belum punya transaksi bertaut.

insert into public.transactions (
  id, user_id, account_id, category_id,
  kind, amount, note, occurred_on, recurring_rule_id, trade_id
)
select
  gen_random_uuid(),
  t.user_id,
  t.account_id,
  null,
  case when t.side = 'buy' then 'expense' else 'income' end,
  case when t.side = 'buy'
    then t.quantity * t.price_per_unit + t.fee
    else greatest(0.01, t.quantity * t.price_per_unit - t.fee)
  end,
  case when t.side = 'buy' then 'Beli ' else 'Jual ' end || a.symbol,
  t.traded_on,
  null,
  t.id
from public.trades t
join public.assets a on a.id = t.asset_id
where t.account_id is not null
  and not exists (
    select 1 from public.transactions tx where tx.trade_id = t.id
  );
