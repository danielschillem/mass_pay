// ── Enumerations ─────────────────────────────────────────────────

export type TenantStatus = "prospect" | "kyb_pending" | "active" | "suspended";
export type UserRole = "super_admin" | "tenant_admin" | "tenant_manager" | "tenant_auditor";
export type Operator = "orange" | "moov" | "unknown";
export type BatchType = "salaire" | "prime" | "commission" | "autre";
export type BatchStatus = "draft" | "validated" | "processing" | "completed" | "failed";
export type ItemStatus = "pending" | "success" | "failed" | "retrying";
export type WalletTxType = "recharge" | "batch_debit" | "refund" | "commission";

// ── Entités ───────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  slug: string;
  raison_sociale: string;
  rccm: string;
  ifu: string;
  secteur: string;
  status: TenantStatus;
  commission_rate: number;
  validation_threshold: number;
  batch_amount_limit: number;
  wallet?: Wallet;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  tenant_id: string;
  available_balance: number; // FCFA
  reserved_balance: number;
  total_debited: number;
  total_commission: number;
  total_refunded: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  tenant_id: string;
  type: WalletTxType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string;
  batch_id?: string;
  note: string;
  created_at: string;
}

export interface Beneficiary {
  id: string;
  tenant_id: string;
  full_name: string;
  phone_number: string;
  operator: Operator;
  group_name: string;
  default_amount: number;
  is_active: boolean;
  external_ref: string;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  tenant_id: string;
  label: string;
  type: BatchType;
  status: BatchStatus;
  total_amount: number;
  commission_amount: number;
  provision_amount: number;
  commission_rate: number;
  item_count: number;
  success_count: number;
  failure_count: number;
  created_by_id: string;
  validated_by_id?: string;
  executed_by_id?: string;
  started_at?: string;
  completed_at?: string;
  items?: BatchItem[];
  created_at: string;
  updated_at: string;
}

export interface BatchItem {
  id: string;
  batch_id: string;
  tenant_id: string;
  beneficiary_id?: string;
  full_name: string;
  phone_number: string;
  operator: Operator;
  amount: number;
  status: ItemStatus;
  attempts: number;
  operator_ref?: string;
  failure_reason?: string;
  processed_at?: string;
  created_at: string;
}

// ── Requêtes ──────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    tenant_id: string | null;
    tenant_name: string;
  };
}

export interface CreateBatchItemInput {
  beneficiary_id?: string;
  full_name: string;
  phone_number: string;
  amount: number;
}

export interface CreateBatchRequest {
  label: string;
  type: BatchType;
  items: CreateBatchItemInput[];
}

export interface CreateUserRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface UpdateBeneficiaryRequest {
  full_name?: string;
  group_name?: string;
  default_amount?: number;
  external_ref?: string;
}

export interface TenantDetail {
  tenant: Tenant;
  user_count: number;
  benef_count: number;
  batch_count: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

export interface DashboardStats {
  total_beneficiaries: number;
  total_batches: number;
  monthly_volume_fcfa: number;
  failed_items: number;
}

export interface GlobalStats {
  total_tenants: number;
  active_tenants: number;
  total_volume_fcfa: number;
  total_commission_fcfa: number;
  total_batches: number;
}

// ── Helpers ───────────────────────────────────────────────────────

export const fcfa = (n: number): string =>
  n.toLocaleString("fr-FR") + " FCFA";

export const shortFcfa = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M FCFA";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K FCFA";
  return n + " FCFA";
};

export const calcCommission = (masse: number, rate = 0.015): number =>
  Math.floor(masse * rate);

export const calcProvision = (masse: number, rate = 0.015): number =>
  masse + calcCommission(masse, rate);
