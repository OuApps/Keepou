/**
 * Typed auth API calls (handoff §5 / ARCHITECTURE §8).
 * Register/login return a bearer token pair; `me` drives the session context.
 */
import { api } from './client'

export interface TokenPair {
  access: string
  refresh: string
}

export type ServerLanguage = 'FR' | 'EN'

export interface UserOut {
  id: string
  email: string
  display_name: string
  role: 'MEMBER' | 'ADMIN'
  status: 'ACTIVE' | 'DISABLED'
  /** Preferred UI language (E12) — the front adopts it on load. */
  language: ServerLanguage
  created_at: string
}

export interface RegisterInput {
  email: string
  password: string
  display_name: string
}

export function login(email: string, password: string): Promise<TokenPair> {
  return api.post<TokenPair>('/api/auth/login', { email, password })
}

export function register(input: RegisterInput): Promise<TokenPair> {
  return api.post<TokenPair>('/api/auth/register', input)
}

export function fetchMe(): Promise<UserOut> {
  return api.get<UserOut>('/api/auth/me')
}

/** Self-service profile update (E11 display name / E12 language) — only the
 * provided fields change server-side. */
export function updateMe(patch: {
  display_name?: string
  language?: ServerLanguage
}): Promise<UserOut> {
  return api.patch<UserOut>('/api/auth/me', patch)
}
