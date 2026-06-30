-- ============================================================================
-- Post-migration verification — run AFTER migrations + steps 4-5.
--   psql "$DATABASE_URL" -f 04-verify-migration.sql
-- Every check should print OK (check 5 may print WARN until tokens are issued).
-- ============================================================================

\echo '== 1. Default tenant + active default store exist =='
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM tenants t JOIN stores s ON s."tenantId" = t.id
  WHERE t.slug = 'app' AND s."isDefault" AND s.status = 'ACTIVE'
) THEN 'OK' ELSE 'FAIL: missing app tenant or its default store' END AS check_1_default_tenant;

\echo '== 2. No tenant-scoped row has a NULL tenantId (key tables) =='
SELECT CASE WHEN (
    (SELECT count(*) FROM users        WHERE "tenantId" IS NULL)
  + (SELECT count(*) FROM products     WHERE "tenantId" IS NULL)
  + (SELECT count(*) FROM categories   WHERE "tenantId" IS NULL)
  + (SELECT count(*) FROM orders       WHERE "tenantId" IS NULL)
  + (SELECT count(*) FROM order_items  WHERE "tenantId" IS NULL)
  + (SELECT count(*) FROM payments     WHERE "tenantId" IS NULL)
  + (SELECT count(*) FROM ui_settings  WHERE "tenantId" IS NULL)
) = 0 THEN 'OK' ELSE 'FAIL: NULL tenantId rows remain' END AS check_2_no_null_tenant;

\echo '== 3. Store-scoped order/payment rows have a storeId =='
SELECT CASE WHEN (
    (SELECT count(*) FROM orders   WHERE "storeId" IS NULL)
  + (SELECT count(*) FROM payments WHERE "storeId" IS NULL)
) = 0 THEN 'OK' ELSE 'FAIL: NULL storeId on store-scoped rows' END AS check_3_no_null_store;

\echo '== 4. SUPER_ADMIN role exists and is assigned =='
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE r.name = 'SUPER_ADMIN'
) THEN 'OK' ELSE 'FAIL: no SUPER_ADMIN assigned — run 02-bootstrap-super-admin.sql' END AS check_4_super_admin;

\echo '== 5. Default tenant has both machine token hashes set =='
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM tenants
  WHERE slug = 'app' AND "reportingTokenHash" IS NOT NULL AND "printAgentKeyHash" IS NOT NULL
) THEN 'OK' ELSE 'WARN: app tenant has no tokens — run 03-generate-machine-tokens.sh app' END AS check_5_tokens;

\echo '== 6. All three multi-tenant migrations are recorded as applied =='
SELECT CASE WHEN (
  SELECT count(*) FROM _prisma_migrations
  WHERE migration_name IN (
    '20260627000000_multitenancy_core',
    '20260630000000_tenant_scope_unique_constraints',
    '20260630010000_tenant_machine_tokens'
  ) AND finished_at IS NOT NULL
) = 3 THEN 'OK' ELSE 'FAIL: not all 3 multi-tenant migrations applied' END AS check_6_migrations;
