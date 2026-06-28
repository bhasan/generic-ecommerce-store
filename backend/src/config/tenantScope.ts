// backend/src/config/tenantScope.ts
// Single source of truth for tenant-isolation scoping. Mirrors the Prisma @@map
// table names. UNSCOPED tables get no RLS; STORE_SCOPED tables carry store_id in
// addition to tenant_id. Everything else is tenant-scoped (tenant_id only).
export const UNSCOPED_TABLES: ReadonlySet<string> = new Set([
  'roles',
  'address_geocode_cache',
  'tenants',
  'stores',
  'refresh_tokens',
]);

export const STORE_SCOPED_TABLES: ReadonlySet<string> = new Set([
  'orders',
  'order_items',
  'order_status_events',
  'payments',
  'cart_items',
  'print_jobs',
  'pos_outbox',
  'order_pos_mappings',
  'announcements',
  'contact_messages',
]);

export function isUnscoped(table: string): boolean {
  return UNSCOPED_TABLES.has(table);
}

export function isStoreScoped(table: string): boolean {
  return STORE_SCOPED_TABLES.has(table);
}
