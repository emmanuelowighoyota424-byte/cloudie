import { WorkspaceRole } from '@prisma/client'

export type Permission =
  | 'workspace.read' | 'workspace.manage' | 'members.read' | 'members.manage'
  | 'shipments.read' | 'shipments.create' | 'shipments.update' | 'shipments.assign' | 'shipments.deliver'
  | 'warehouse.read' | 'warehouse.manage' | 'documents.read' | 'documents.write' | 'documents.delete'
  | 'orders.read' | 'orders.create' | 'orders.manage' | 'payments.manage' | 'billing.read' | 'admin.platform'

const permissions: Record<Permission, readonly WorkspaceRole[]> = {
  'workspace.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','DRIVER','WAREHOUSE_STAFF','CUSTOMER','VENDOR'],
  'workspace.manage': ['SUPER_ADMIN','WORKSPACE_ADMIN'],
  'members.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'],
  'members.manage': ['SUPER_ADMIN','WORKSPACE_ADMIN'],
  'shipments.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','DRIVER','WAREHOUSE_STAFF'],
  'shipments.create': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'],
  'shipments.update': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'],
  'shipments.assign': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'],
  'shipments.deliver': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','DRIVER'],
  'warehouse.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','WAREHOUSE_STAFF'],
  'warehouse.manage': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'],
  'documents.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','DRIVER','WAREHOUSE_STAFF','CUSTOMER'],
  'documents.write': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','DRIVER','WAREHOUSE_STAFF'],
  'documents.delete': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'],
  'orders.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','CUSTOMER','VENDOR'],
  'orders.create': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','CUSTOMER'],
  'orders.manage': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'],
  'payments.manage': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'],
  'billing.read': ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','DRIVER','WAREHOUSE_STAFF','CUSTOMER','VENDOR'],
  'admin.platform': ['SUPER_ADMIN'],
}

export function roleHasPermission(role: WorkspaceRole, permission: Permission) { return permissions[permission].includes(role) }
export function rolesForPermission(permission: Permission) { return permissions[permission] }
