/**
 * Typed auth API calls (handoff §5 / ARCHITECTURE §8).
 * Register/login return a bearer token pair; `me` drives the session context.
 */
import { api } from './client'

export interface TokenPair {
  access: string
  refresh: string
}

export interface UserOut {
  id: string
  email: string
  display_name: string
  role: 'MEMBER' | 'ADMIN'
  status: 'ACTIVE' | 'DISABLED'
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
