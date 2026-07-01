/**
 * JWT bearer token storage (handoff §4/§8: access + refresh in localStorage).
 *
 * E0 only wires the storage + read helpers so the API client and the route guard
 * have a single source of truth. E2 issues the real tokens on login/register.
 */

const ACCESS_KEY = 'keepou.access'
const REFRESH_KEY = 'keepou.refresh'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh?: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  if (refresh !== undefined) localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}
