/**
 * fetch wrapper for the FastAPI API.
 * - attaches the JWT bearer token (`Authorization: Bearer <access>`) from localStorage
 *   when present (auth is a header, not a cookie — E1-S6 / ARCHITECTURE §8);
 * - surfaces typed errors (status + payload) so the UI can map 401/403/409;
 * - on a 401 from a protected endpoint, tries `POST /api/auth/refresh` once and
 *   retries; if the session is really gone — or a 403 says the account was
 *   disabled (`code: "account_disabled"`, FR-A5) — drops the tokens and emits
 *   `keepou:session-expired` so the auth context returns the user to /login.
 */
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../auth/storage'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

/** Emitted when the bearer session is invalid (or the account disabled). */
export const SESSION_EXPIRED_EVENT = 'keepou:session-expired'

// Public auth endpoints where a 401/403 is a business answer (bad credentials,
// disabled at login…) rendered inline — never auto-refresh nor drop the session.
const PUBLIC_AUTH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh']

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

/** `detail` is either a plain string or a structured `{code, message}` object. */
function detailOf(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    return (payload as { detail: unknown }).detail
  }
  return null
}

function detailMessage(payload: unknown): string | null {
  const detail = detailOf(payload)
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message)
  }
  return null
}

function isAccountDisabled(payload: unknown): boolean {
  const detail = detailOf(payload)
  return (
    detail !== null &&
    typeof detail === 'object' &&
    'code' in detail &&
    (detail as { code: unknown }).code === 'account_disabled'
  )
}

function doFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// Single-flight: concurrent 401s share one refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null

function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const refresh = getRefreshToken()
      if (!refresh) return false
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      if (!res.ok) return false
      const data = (await res.json().catch(() => null)) as { access?: string } | null
      if (!data?.access) return false
      setTokens(data.access)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function endSession() {
  clearTokens()
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await doFetch(method, path, body)
  const isProtected = !PUBLIC_AUTH_PATHS.includes(path)

  // Expired access token? Swap the refresh token for a new one and retry once.
  if (res.status === 401 && isProtected) {
    if ((await tryRefresh()) === true) {
      res = await doFetch(method, path, body)
    }
    if (res.status === 401) {
      endSession()
    }
  }

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await res.json().catch(() => null) : null

  // Mid-session deactivation (FR-A5): the server flags this specific 403 so we
  // end the session — other 403s (forbidden resource) stay on screen.
  if (res.status === 403 && isProtected && isAccountDisabled(payload)) {
    endSession()
  }

  if (!res.ok) {
    const message = detailMessage(payload) || res.statusText || 'Erreur réseau'
    throw new ApiError(res.status, message, payload)
  }

  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
