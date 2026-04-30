// ─── Shared domain types ─────────────────────────────────────────────────────
// These mirror the PostgreSQL schema defined in database/migrations/001_initial.sql

export type UUID = string;

export type UserRole = 'user' | 'admin';

export interface User {
  id: UUID;
  auth_id: string;
  display_name: string;
  /** ISO 4217 currency code (e.g. "BDT", "USD") */
  currency: string;
  mood_tracking_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionCategory =
  | 'needs'
  | 'wants'
  | 'savings'
  | 'debt_payment'
  | 'income'
  | 'transfer';

export type MoodTag =
  | 'happy'
  | 'sad'
  | 'anxious'
  | 'neutral'
  | 'excited'
  | 'tired'
  | 'grateful';

export interface Transaction {
  id: UUID;
  user_id: UUID;
  amount: number;
  /** ISO 4217 */
  currency: string;
  /** Amount converted to user's base currency */
  amount_base: number;
  category: TransactionCategory;
  merchant: string | null;
  note: string | null;
  mood_tag: MoodTag | null;
  /** Supabase Storage signed URL */
  receipt_url: string | null;
  /** emoji tag e.g. "☕" */
  emoji_tag: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTransactionDto {
  amount: number;
  currency: string;
  category: TransactionCategory;
  merchant?: string;
  note?: string;
  mood_tag?: MoodTag;
  emoji_tag?: string;
  transaction_date: string;
  receipt_url?: string;
}

export interface UpdateTransactionDto extends Partial<CreateTransactionDto> {
  id: UUID;
}

// ─── Savings Goals ────────────────────────────────────────────────────────────

export interface SavingsGoal {
  id: UUID;
  user_id: UUID;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  deadline: string | null;
  /** emoji used as branch icon e.g. "🌿" */
  branch_emoji: string;
  is_achieved: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSavingsGoalDto {
  name: string;
  target_amount: number;
  currency: string;
  deadline?: string;
  branch_emoji?: string;
}

export interface UpdateSavingsGoalDto extends Partial<CreateSavingsGoalDto> {
  id: UUID;
  current_amount?: number;
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export type DebtDirection = 'borrowed' | 'lent';

export interface Debt {
  id: UUID;
  user_id: UUID;
  counterparty_name: string;
  direction: DebtDirection;
  amount: number;
  currency: string;
  due_date: string | null;
  note: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDebtDto {
  counterparty_name: string;
  direction: DebtDirection;
  amount: number;
  currency: string;
  due_date?: string;
  note?: string;
}

// ─── Bill Splits ──────────────────────────────────────────────────────────────

export interface Split {
  id: UUID;
  user_id: UUID;
  title: string;
  total_amount: number;
  currency: string;
  created_at: string;
  participants: SplitParticipant[];
}

export interface SplitParticipant {
  id: UUID;
  split_id: UUID;
  name: string;
  share_amount: number;
  paid_at: string | null;
}

export interface CreateSplitDto {
  title: string;
  total_amount: number;
  currency: string;
  participants: Array<{ name: string; share_amount: number }>;
}

// ─── AI Reflections ───────────────────────────────────────────────────────────

export interface AIReflection {
  id: UUID;
  user_id: UUID;
  period_start: string;
  period_end: string;
  narrative_text: string;
  /** Budget alert message (soft/poetic), null if no issues */
  budget_alert: string | null;
  generated_at: string;
}

// ─── API Pagination ───────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  /** ISO 8601 */
  from?: string;
  /** ISO 8601 */
  to?: string;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'excel';

export interface ExportRequest {
  format: ExportFormat;
  from: string;
  to: string;
}
