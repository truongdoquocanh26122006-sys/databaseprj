const API_BASE = '/api';
let authToken = typeof window !== 'undefined' ? window.localStorage.getItem('studyspace_token') || '' : '';

export type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const payload = (await response.json()) as ApiResult<T>;
  if (!payload.ok) {
    throw new Error(payload.error || 'API error');
  }
  return payload.data as T;
}

export function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function setAuthToken(token: string) {
  authToken = token;
  if (!token) {
    window.localStorage.removeItem('studyspace_token');
    return;
  }
  window.localStorage.setItem('studyspace_token', token);
}
