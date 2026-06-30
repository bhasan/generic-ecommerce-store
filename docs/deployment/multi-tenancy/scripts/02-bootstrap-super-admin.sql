-- ============================================================================
-- Bootstrap a SUPER_ADMIN platform operator — run AFTER the migrations apply.
--   psql "$DATABASE_URL" -f 02-bootstrap-super-admin.sql
--
-- Grants the SUPER_ADMIN role to an EXISTING admin user (default username
-- 'admin') in the default 'app' tenant. No new user / password is created — you
-- log in as that user and gain platform (cross-tenant) access (tenant
-- management). Change the username below if your operator account differs.
--
-- SUPER_ADMIN is the ONLY role that may manage tenants; a regular per-tenant
-- ADMIN cannot. Grant it only to genuine platform operators.
-- ============================================================================
\set admin_username 'admin'

-- 1. Ensure the SUPER_ADMIN role exists.
INSERT INTO roles (name, "createdAt", "updatedAt")
VALUES ('SUPER_ADMIN', now(), now())
ON CONFLICT (name) DO NOTHING;

-- 2. Grant it to the admin user, scoped to the default tenant.
INSERT INTO user_roles ("userId", "roleId", "tenantId", "createdAt")
SELECT u.id, r.id, t.id, now()
FROM users u
CROSS JOIN roles r
CROSS JOIN tenants t
WHERE u.username = :'admin_username'
  AND r.name     = 'SUPER_ADMIN'
  AND t.slug     = 'app'
  AND u."tenantId" = t.id
ON CONFLICT ("userId", "roleId") DO NOTHING;

-- 3. Confirm (expect at least one row for your admin user).
\echo '== SUPER_ADMIN assignments (expect 1+) =='
SELECT u.username, r.name, ur."tenantId"
FROM user_roles ur
JOIN users u ON u.id = ur."userId"
JOIN roles r ON r.id = ur."roleId"
WHERE r.name = 'SUPER_ADMIN';
