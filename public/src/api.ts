// REST client — Authorization: Bearer <cernere token> を付けて叩く。
// token は Cernere の SSO redirect 後に localStorage に積まれた前提。

const TOKEN_KEY = 'bibliotheca:cernere_token';

export function getToken(): string | null {
  // URL ハッシュに #token=... が乗っていれば取り込む (Cernere redirect 想定)
  if (typeof location !== 'undefined' && location.hash.includes('token=')) {
    const m = location.hash.match(/token=([^&]+)/);
    if (m && m[1]) {
      const tok = decodeURIComponent(m[1]);
      localStorage.setItem(TOKEN_KEY, tok);
      history.replaceState(null, '', location.pathname + location.search);
      return tok;
    }
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const err = new Error(`HTTP ${res.status}`) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = res.status;
    err.body = detail;
    throw err;
  }
  return (await res.json()) as T;
}

export interface MeResponse {
  userId: string;
  displayName: string | null;
  role: string;
  isAdmin: boolean;
}

export interface BookMeta {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  cover: string | null;
}

export interface EquipmentMeta {
  qrCode: string;
  name: string;
  spec: string | null;
}

export interface LoanView {
  id: number;
  source: 'book' | 'equipment';
  external_key: string;
  borrower_user_id: string;
  borrower_display_name: string | null;
  borrowed_at: string;
  due_at: string | null;
  returned_at: string | null;
  returned_by_user_id: string | null;
  note: string | null;
  label: string | null;
}

export interface EquipmentRow {
  qr_code: string;
  name: string;
  spec: string | null;
  added_at: string;
  added_by_user_id: string;
}

export const api = {
  me: () => req<MeResponse>('/api/me'),
  lookup: (source: 'book' | 'equipment', key: string) =>
    req<{ source: string; meta: BookMeta | EquipmentMeta }>(
      `/api/items/lookup?source=${source}&key=${encodeURIComponent(key)}`,
    ),
  listEquipment: () =>
    req<{ items: EquipmentRow[] }>('/api/items/equipment'),
  registerEquipment: (qr_code: string, name: string, spec: string | null) =>
    req<{ equipment: EquipmentRow; generated_qr: boolean }>('/api/items/equipment', {
      method: 'POST',
      body: JSON.stringify({ qr_code, name, spec }),
    }),
  bulkEquipment: (items: Array<{ qr_code?: string; name: string; spec?: string | null }>) =>
    req<{
      ok: number;
      errors: number;
      results: Array<
        | { ok: true; equipment: EquipmentRow; generated_qr: boolean }
        | { ok: false; index: number; error: string }
      >;
    }>('/api/items/equipment/bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  bulkBooks: (isbns: string[]) =>
    req<{ ok: number; total: number; results: Array<{ isbn: string; ok: boolean; title?: string }> }>(
      '/api/items/books/bulk',
      { method: 'POST', body: JSON.stringify({ isbns }) },
    ),
  borrow: (
    source: 'book' | 'equipment',
    external_key: string,
    due_at: string | null,
    note: string | null,
  ) =>
    req<{ loan: LoanView }>('/api/loans', {
      method: 'POST',
      body: JSON.stringify({ source, external_key, due_at, note }),
    }),
  returnLoan: (loanId: number) =>
    req<{ loan: LoanView }>(`/api/loans/${loanId}/return`, {
      method: 'POST',
    }),
  listOpen: () => req<{ items: LoanView[] }>('/api/loans/open'),
  listMine: (includeReturned: boolean) =>
    req<{ items: LoanView[] }>(
      `/api/loans/mine${includeReturned ? '?all=1' : ''}`,
    ),
};
