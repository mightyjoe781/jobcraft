const BASE = "/api";

function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

function storeTokens(access: string, refresh: string): void {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

function clearTokens(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function refreshTokens(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = await res.json();
    storeTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const hadRefreshToken = !!getRefreshToken();
    const newToken = await refreshTokens();
    if (newToken) {
      return apiFetch<T>(path, options, false);
    }
    if (hadRefreshToken) {
      // Had a token but it was rejected — session truly expired.
      // Tokens already cleared; let React handle the redirect.
      throw Object.assign(new Error("Session expired"), { status: 401 });
    }
    // No refresh token at all — fall through to the normal error handler
    // so the caller gets the real response body (e.g. "Invalid credentials").
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = body.detail;
    const message = typeof detail === "string"
      ? detail
      : (detail?.msg ?? detail?.code ?? JSON.stringify(detail) ?? "Request failed");
    throw Object.assign(new Error(message), { status: res.status, body });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { storeTokens, clearTokens, getAccessToken };
