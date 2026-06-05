import type {
  LoginRequest, LoginResponse,
  Tenant, Wallet, Batch, Beneficiary,
  CreateBatchRequest, PaginatedResponse,
  DashboardStats, GlobalStats,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

// ── Auth store (localStorage) ─────────────────────────────────────
const TOKEN_KEY = "masspay_token";

export const auth = {
  getToken: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null,
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
  isLoggedIn: (): boolean => !!auth.getToken(),
};

// ── Fetch wrapper ─────────────────────────────────────────────────
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

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

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

  // Super Admin
  admin: {
    stats: () => get<GlobalStats>("/admin/stats"),
    tenants: (page = 1, size = 20, status?: string) =>
      get<PaginatedResponse<Tenant>>(`/admin/tenants?page=${page}&size=${size}${status ? `&status=${status}` : ""}`),
    createTenant: (data: unknown) => post<Tenant>("/admin/tenants", data),
    activate: (id: string) => patch<{ message: string }>(`/admin/tenants/${id}/activate`),
    suspend:  (id: string) => patch<{ message: string }>(`/admin/tenants/${id}/suspend`),
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
    createBeneficiary: (data: unknown) => post<Beneficiary>("/tenant/beneficiaries", data),
    deleteBeneficiary: (id: string) => del<{ message: string }>(`/tenant/beneficiaries/${id}`),
  },
};
