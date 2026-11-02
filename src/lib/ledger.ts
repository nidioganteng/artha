// Fungsi murni untuk ledger: saldo rekening dan laporan bulanan.
// Perlakuan fee mengikuti calc.ts/flowsOf:
// Beli: arus kas keluar = quantity * price + fee (modal total)
// Jual: arus kas masuk = quantity * price - fee (hasil bersih)

import type { Account, Category, Transaction, Trade } from './types'

export interface MonthByCategory {
  categoryId: string | null
  name: string
  kind: 'income' | 'expense'
  total: number
}

export interface AccountChange {
  accountId: string
  name: string
  opening: number
  change: number
  closing: number
}

export interface MonthReport {
  income: number
  expense: number
  investBuy: number
  investSell: number
  net: number
  byCategory: MonthByCategory[]
  accountChanges: AccountChange[]
}

export interface UnassignedTrades {
  trades: Trade[]
  totalValue: number
}

/** Nilai arus kas trade: beli = keluar (positif = yang keluar), jual = masuk (positif = yang masuk). */
function tradeBuyCost(t: Trade): number {
  return t.quantity * t.price_per_unit + t.fee
}
function tradeSellProceeds(t: Trade): number {
  return t.quantity * t.price_per_unit - t.fee
}

/**
 * Saldo rekening pada tanggal upTo (inklusif) atau sampai sekarang.
 * Dimulai dari opening_balance, ditambah pemasukan, dikurangi pengeluaran,
 * dikurangi modal beli DCA (qty*price+fee), ditambah hasil jual (qty*price-fee).
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  trades: Trade[],
  upTo?: string,
): number {
  let bal = account.opening_balance ?? 0
  const includeTx = (iso: string) => (upTo ? iso <= upTo : true)
  for (const t of transactions) {
    if (t.account_id !== account.id) continue
    if (!includeTx(t.occurred_on)) continue
    if (t.kind === 'income') bal += t.amount
    else bal -= t.amount
  }
  for (const t of trades) {
    if (t.account_id !== account.id) continue
    if (!includeTx(t.traded_on)) continue
    if (t.side === 'buy') bal -= tradeBuyCost(t)
    else bal += tradeSellProceeds(t)
  }
  return bal
}

/** Tanggal terakhir hari sebelum bulan `month` (YYYY-MM). Dipakai sebagai cutoff saldo awal bulan. */
function dayBeforeMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  // Hari ke-0 bulan `m` = hari terakhir bulan sebelumnya.
  const d = new Date(y, m - 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Hari terakhir bulan `month`. */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Laporan bulanan: arus kas, per kategori, perubahan saldo per rekening.
 * net = income - expense - investBuy + investSell
 */
export function monthReport(
  month: string,
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  trades: Trade[],
): MonthReport {
  const inMonth = (iso: string) => iso.startsWith(month)

  const txMonth = transactions.filter((t) => inMonth(t.occurred_on))
  const trMonth = trades.filter((t) => inMonth(t.traded_on))

  const income = txMonth.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txMonth.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
  const investBuy = trMonth
    .filter((t) => t.side === 'buy')
    .reduce((s, t) => s + tradeBuyCost(t), 0)
  const investSell = trMonth
    .filter((t) => t.side === 'sell')
    .reduce((s, t) => s + tradeSellProceeds(t), 0)
  const net = income - expense - investBuy + investSell

  // Per kategori: gabung income + expense
  const catMap = new Map<string, MonthByCategory>()
  for (const t of txMonth) {
    const key = t.category_id ?? '__none__'
    const cat = categories.find((c) => c.id === t.category_id)
    const name = cat?.name ?? 'Tanpa kategori'
    const kind: 'income' | 'expense' = t.kind
    const mapKey = `${key}:${kind}`
    const existing = catMap.get(mapKey)
    if (existing) existing.total += t.amount
    else
      catMap.set(mapKey, {
        categoryId: t.category_id,
        name,
        kind,
        total: t.amount,
      })
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.total - a.total)

  // Perubahan saldo per rekening
  const cutoffOpening = dayBeforeMonth(month)
  const cutoffClosing = lastDayOfMonth(month)
  const accountChanges: AccountChange[] = accounts.map((acc) => {
    const opening = accountBalance(acc, transactions, trades, cutoffOpening)
    const closing = accountBalance(acc, transactions, trades, cutoffClosing)
    return {
      accountId: acc.id,
      name: acc.name,
      opening,
      change: closing - opening,
      closing,
    }
  })

  return { income, expense, investBuy, investSell, net, byCategory, accountChanges }
}

/** Trade yang belum punya sumber dana (account_id null/undefined) beserta total nilai. */
export function unassignedTrades(trades: Trade[]): UnassignedTrades {
  const list = trades.filter((t) => t.account_id == null)
  const totalValue = list.reduce(
    (s, t) => s + (t.side === 'buy' ? tradeBuyCost(t) : tradeSellProceeds(t)),
    0,
  )
  return { trades: list, totalValue }
}
