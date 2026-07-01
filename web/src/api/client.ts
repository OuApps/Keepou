/**
 * fetch wrapper for the FastAPI API.
 * - attaches the JWT bearer token (`Authorization: Bearer <access>`) from localStorage
 *   when present (auth is a header, not a cookie — E1-S6 / ARCHITECTURE §8);
 * - surfaces typed errors (status + payload) so the UI can map 401/403/409.
 *
 * Skeleton: fine-grained code handling (401 → login redirect, 403 → message,
 * 409 → lock conflict) is wired per epic (E2 auth, E5 lock).
 */
import { getAccessToken } from '../auth/storage'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await res.json().catch(() => null) : null

  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : res.statusText) || 'Erreur réseau'
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
