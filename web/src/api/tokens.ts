/**
 * Personal Access Token endpoints (E13) — the MCP agent-access tokens managed
 * from the account menu. The full secret is returned only by `createToken`
 * (shown once); the list carries metadata only.
 */
import { api } from './client'

export interface PatOut {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export interface PatCreatedOut extends PatOut {
  /** The full secret — returned exactly once, at creation. */
  token: string
}

export function listTokens(): Promise<PatOut[]> {
  return api.get<PatOut[]>('/api/tokens')
}

export function createToken(name: string): Promise<PatCreatedOut> {
  return api.post<PatCreatedOut>('/api/tokens', { name })
}

export function revokeToken(id: string): Promise<void> {
  return api.delete<void>(`/api/tokens/${id}`)
}
