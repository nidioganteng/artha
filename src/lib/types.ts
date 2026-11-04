export type Kind = 'income' | 'expense'

export interface Account {
  id: string
  user_id: string
  name: string
  type: 'cash' | 'bank' | 'ewallet'
  opening_balance: number
}

export interface Category {
  id: string
  user_id: string
  name: string
  kind: Kind
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string | null
  category_id: string | null
  kind: Kind
  amount: number
  note: string | null
  occurred_on: string
  recurring_rule_id: string | null
  trade_id: string | null
}

export interface Platform {
  id: string
  user_id: string
  name: string
}

export interface Asset {
  id: string
  user_id: string
  symbol: string
  name: string
  asset_type: 'crypto' | 'gold' | 'stock' | 'fund' | 'other'
  unit: string
  price_source: 'indodax' | 'manual'
  price_ref: string | null
  manual_price: number | null
  manual_price_at: string | null
}

export interface Trade {
  id: string
  user_id: string
  asset_id: string
  platform_id: string | null
  account_id?: string | null
  contributor_id?: string | null
  side: 'buy' | 'sell'
  quantity: number
  price_per_unit: number
  fee: number
  traded_on: string
  note: string | null
}

export type AccountMode = 'lengkap' | 'investasi'

export interface Profile {
  id: string        // = user_id (1:1 dengan auth.users)
  user_id: string
  mode: AccountMode
  mode_locked: boolean
}

export interface Contributor {
  id: string
  user_id: string
  name: string
  sort_order: number
}

export interface RecurringRule {
  id: string
  user_id: string
  name: string
  kind: 'income' | 'expense' | 'invest'
  amount: number
  category_id: string | null
  account_id: string | null
  day_of_month: number
  active: boolean
}

export interface RecurringCheck {
  id: string
  user_id: string
  rule_id: string
  month: string
  paid_at: string
  transaction_id: string | null
}

export interface PriceSnapshot {
  id: string
  user_id: string
  asset_id: string
  date: string        // ISO date "YYYY-MM-DD"
  price: number
  source: 'live' | 'manual' | 'history'
  created_at: string
}

export interface DB {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  platforms: Platform[]
  assets: Asset[]
  trades: Trade[]
  recurring_rules: RecurringRule[]
  recurring_checks: RecurringCheck[]
  price_snapshots: PriceSnapshot[]
  profiles: Profile[]
  contributors: Contributor[]
}

export type TableName = keyof DB
