/**
 * Typed admin API calls (E7, handoff §5). Every endpoint is admin-only — the
 * real guard is the server's `require_admin` (claude.md §6); the front only
 * renders what the API returns.
 */
import type { UserOut } from './auth'
import { api } from './client'

/** One row of the admin listing: registered member or pending invitee. */
export interface MemberOut {
  email: string
  pending: boolean
  user_id: string | null
  display_name: string | null
  role: 'MEMBER' | 'ADMIN' | null
  status: 'ACTIVE' | 'DISABLED' | null
  created_at: string | null
  allowlist_id: string | null
  added_at: string | null
}

export interface AdminUserPatch {
  role?: 'MEMBER' | 'ADMIN'
  status?: 'ACTIVE' | 'DISABLED'
}

export function fetchMembers(): Promise<MemberOut[]> {
  return api.get<MemberOut[]>('/api/admin/members')
}

export function addAllowlistEntry(email: string): Promise<MemberOut> {
  return api.post<MemberOut>('/api/admin/allowlist', { email })
}

export function removeAllowlistEntry(entryId: string): Promise<void> {
  return api.delete<void>(`/api/admin/allowlist/${entryId}`)
}

export function patchUser(userId: string, patch: AdminUserPatch): Promise<UserOut> {
  return api.patch<UserOut>(`/api/admin/users/${userId}`, patch)
}
