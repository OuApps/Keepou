/**
 * Typed admin API calls (E7, handoff §5). Every endpoint is guarded by
 * `require_admin` server-side — a member gets a 403 whatever the UI shows.
 */
import { api } from './client'
import type { UserOut } from './auth'

export interface MemberOut {
  email: string
  pending: boolean
  // Registered members (pending=false)
  user_id: string | null
  display_name: string | null
  role: 'MEMBER' | 'ADMIN' | null
  status: 'ACTIVE' | 'DISABLED' | null
  registered_at: string | null
  // Pending invitees (pending=true)
  allowlist_id: string | null
  allowed_at: string | null
}

export interface UserAdminPatch {
  role?: 'MEMBER' | 'ADMIN'
  status?: 'ACTIVE' | 'DISABLED'
}

export function fetchMembers(): Promise<MemberOut[]> {
  return api.get<MemberOut[]>('/api/admin/members')
}

export function addToAllowlist(email: string): Promise<MemberOut> {
  return api.post<MemberOut>('/api/admin/allowlist', { email })
}

export function removeAllowlistEntry(entryId: string): Promise<void> {
  return api.delete<void>(`/api/admin/allowlist/${entryId}`)
}

export function patchUser(userId: string, patch: UserAdminPatch): Promise<UserOut> {
  return api.patch<UserOut>(`/api/admin/users/${userId}`, patch)
}
