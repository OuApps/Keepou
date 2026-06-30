/**
 * Wrapper fetch pour l'API FastAPI.
 * - envoie les cookies de session (`credentials: 'include'`)
 * - remonte des erreurs typées (status + payload) pour gérer 401/403/409 côté UI
 *
 * Squelette : enrichi story par story (auth, notes, lock, admin…).
 */

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
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
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
