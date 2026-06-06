import type {
  LoginRequest, LoginResponse,
  Tenant, TenantDetail, Wallet, WalletTransaction, Batch, Beneficiary, User,
  CreateBatchRequest, PaginatedResponse,
  DashboardStats, GlobalStats,
  CreateUserRequest, UpdateUserRequest, UpdateBeneficiaryRequest,
  KYBDocument, KYBComment, KYBHistory,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

// ── Auth store (localStorage) ─────────────────────────────────────
const TOKEN_KEY = "masspay_token";
const REFRESH_KEY = "masspay_refresh";

export const auth = {
  getToken: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null,
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  getRefreshToken: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null,
  setRefreshToken: (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  isLoggedIn: (): boolean => !!auth.getToken(),
};

// ── Refresh token worker ──────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = auth.getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) {
      auth.clear();
      return null;
    }
    const data = await res.json();
    auth.setToken(data.access_token);
    auth.setRefreshToken(data.refresh_token);
    return data.access_token;
  } catch {
    auth.clear();
    return null;
  }
}

// ── Fetch wrapper with auto-refresh ───────────────────────────────
async function req<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = auth.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${BASE}${path}`, { ...options, headers });

  // Auto-refresh sur 401 — une seule tentative concurrente
  if (res.status === 401 && auth.getRefreshToken()) {
    if (!refreshPromise) {
      refreshPromise = doRefresh();
    }
    const newToken = await refreshPromise;
    refreshPromise = null;

    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${BASE}${path}`, { ...options, headers });
    }
  }

  if (res.status === 401) {
    auth.clear();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expirée");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }

  return res.json() as Promise<T>;
}

const get  = <T>(path: string) => req<T>(path);
const post = <T>(path: string, body: unknown) =>
  req<T>(path, { method: "POST", body: JSON.stringify(body) });
const patch = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
const del  = <T>(path: string) => req<T>(path, { method: "DELETE" });

// ── API ───────────────────────────────────────────────────────────

export const api = {

  // Auth
  login: (data: LoginRequest) =>
    post<LoginResponse>("/auth/login", data),
  me: () => get<{ user: { id: string; email: string; role: string; tenant_id: string | null } }>("/auth/me"),
  logout: () => post<{ message: string }>("/auth/logout", { refresh_token: auth.getRefreshToken() }),

  // Super Admin
  admin: {
    stats: () => get<GlobalStats>("/admin/stats"),
    tenants: (page = 1, size = 20, status?: string) =>
      get<PaginatedResponse<Tenant>>(`/admin/tenants?page=${page}&size=${size}${status ? `&status=${status}` : ""}`),
    getTenant:    (id: string) => get<TenantDetail>(`/admin/tenants/${id}`),
    createTenant: (data: unknown) => post<{ tenant: Tenant }>("/admin/tenants", data),
    updateTenant: (id: string, data: unknown) => patch<Tenant>(`/admin/tenants/${id}`, data),
    activate: (id: string) => patch<{ message: string }>(`/admin/tenants/${id}/activate`),
    suspend:  (id: string) => patch<{ message: string }>(`/admin/tenants/${id}/suspend`),
    rechargeWallet: (tenantId: string, amount: number, _reference?: string) =>
      post<{ message: string; reference: string; wallet: Wallet }>(`/admin/tenants/${tenantId}/wallet/recharge`, { amount }),
    tenantWalletTransactions: (tenantId: string, page = 1, size = 10) =>
      get<PaginatedResponse<WalletTransaction>>(`/admin/tenants/${tenantId}/wallet/transactions?page=${page}&size=${size}`),

    // KYB
    kybDocuments: (tenantId: string) =>
      get<{ data: KYBDocument[] }>(`/admin/tenants/${tenantId}/kyb/documents`),
    uploadKYBDocument: (tenantId: string, data: unknown) =>
      post<KYBDocument>(`/admin/tenants/${tenantId}/kyb/documents`, data),
    reviewKYBDocument: (tenantId: string, docId: string, status: string, reviewNote?: string) =>
      patch<KYBDocument>(`/admin/tenants/${tenantId}/kyb/documents/${docId}/review`, { status, review_note: reviewNote }),
    kybComments: (tenantId: string) =>
      get<{ data: KYBComment[] }>(`/admin/tenants/${tenantId}/kyb/comments`),
    addKYBComment: (tenantId: string, comment: string) =>
      post<KYBComment>(`/admin/tenants/${tenantId}/kyb/comments`, { comment }),
    kybHistory: (tenantId: string) =>
      get<{ data: KYBHistory[] }>(`/admin/tenants/${tenantId}/kyb/history`),
    rejectKYB: (tenantId: string, reason: string) =>
      post<{ message: string }>(`/admin/tenants/${tenantId}/kyb/reject`, { reason }),

    // Utilisateurs d'un tenant (vue admin)
    tenantUsers:       (tenantId: string) =>
      get<{ data: User[]; total: number }>(`/admin/tenants/${tenantId}/users`),
    createTenantUser:  (tenantId: string, data: CreateUserRequest) =>
      post<User>(`/admin/tenants/${tenantId}/users`, data),
    updateTenantUser:  (tenantId: string, userId: string, data: UpdateUserRequest) =>
      patch<User>(`/admin/tenants/${tenantId}/users/${userId}`, data),
    deleteTenantUser:  (tenantId: string, userId: string) =>
      del<{ message: string }>(`/admin/tenants/${tenantId}/users/${userId}`),

    // Super admin users
    adminUsers: () =>
      get<{ data: User[]; total: number }>("/admin/admins"),
    createAdminUser: (data: { email: string; password: string; first_name: string; last_name: string }) =>
      post<User>("/admin/admins", data),
    updateAdminUser: (id: string, data: { first_name?: string; last_name?: string; is_active?: boolean }) =>
      patch<User>(`/admin/admins/${id}`, data),
    deleteAdminUser: (id: string) =>
      del<{ message: string }>(`/admin/admins/${id}`),
  },

  // Tenant
  tenant: {
    dashboard: () => get<{ wallet: Wallet; stats: DashboardStats; recent_batches: Batch[] }>("/tenant/dashboard"),
    wallet:    () => get<Wallet>("/tenant/wallet"),

    // Batchs
    batches:       (page = 1, size = 20) =>
      get<PaginatedResponse<Batch>>(`/tenant/batches?page=${page}&size=${size}`),
    getBatch:      (id: string) => get<Batch>(`/tenant/batches/${id}`),
    createBatch:   (data: CreateBatchRequest) => post<Batch>("/tenant/batches", data),
    validateBatch: (id: string) => post<Batch>(`/tenant/batches/${id}/validate`, {}),
    executeBatch:  (id: string) => post<{ message: string; batch: Batch }>(`/tenant/batches/${id}/execute`, {}),

    // Bénéficiaires
    beneficiaries: (page = 1, size = 50, q = "") =>
      get<PaginatedResponse<Beneficiary>>(`/tenant/beneficiaries?page=${page}&size=${size}&q=${q}`),
    createBeneficiary:  (data: unknown) => post<Beneficiary>("/tenant/beneficiaries", data),
    updateBeneficiary:  (id: string, data: UpdateBeneficiaryRequest) =>
      patch<Beneficiary>(`/tenant/beneficiaries/${id}`, data),
    deleteBeneficiary:  (id: string) => del<{ message: string }>(`/tenant/beneficiaries/${id}`),

    // Wallet transactions
    walletTransactions: (page = 1, size = 20) =>
      get<PaginatedResponse<WalletTransaction>>(`/tenant/wallet/transactions?page=${page}&size=${size}`),

    // Équipe (users)
    users:       () => get<{ data: User[]; total: number }>("/tenant/users"),
    createUser:  (data: CreateUserRequest) => post<User>("/tenant/users", data),
    updateUser:  (id: string, data: UpdateUserRequest) => patch<User>(`/tenant/users/${id}`, data),
    deleteUser:  (id: string) => del<{ message: string }>(`/tenant/users/${id}`),
  },
};
