// Process-wide cache of the default tenant's numeric id, resolved at boot from
// the row with slug 'app'. The legacy-JWT grace path reads this instead of
// assuming id === 1.
let defaultTenantId: number | null = null;

export function setDefaultTenantId(id: number): void {
  defaultTenantId = id;
}

export function getDefaultTenantId(): number | null {
  return defaultTenantId;
}
