export type UserRole = 'admin' | 'manager' | 'sdr' | 'client'

export function canEditUserRole(
  viewerRole: UserRole,
  targetCurrentRole: UserRole,
): boolean {
  if (viewerRole === 'admin') return true
  if (viewerRole === 'manager') return targetCurrentRole === 'sdr'
  return false
}

export function allowedRolesToAssign(viewerRole: UserRole): UserRole[] {
  if (viewerRole === 'admin')   return ['admin', 'manager', 'sdr']
  if (viewerRole === 'manager') return ['manager', 'sdr']
  return []
}

// targetManagerId: the managerId field stored on the target User row
// viewerDbId: the DB primary key (not clerkId) of the viewer
export function canEditUserPermissions(
  viewerRole:        UserRole,
  targetCurrentRole: UserRole,
  targetManagerId:   string | null,
  viewerDbId:        string,
): boolean {
  if (targetCurrentRole !== 'sdr') return false
  if (viewerRole === 'admin')       return true
  if (viewerRole === 'manager')     return targetManagerId === viewerDbId
  return false
}
