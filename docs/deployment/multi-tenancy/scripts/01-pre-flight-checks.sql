-- ============================================================================
-- Pre-flight checks — run BEFORE applying the multi-tenant migrations.
--   psql "$DATABASE_URL" -f 01-pre-flight-checks.sql
-- ============================================================================

\echo '== Has the multi-tenant core migration already been applied? (expect 0 rows) =='
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name = '20260627000000_multitenancy_core';

\echo ''
\echo '== Row counts the core migration backfill will tag (size your maintenance window) =='
SELECT 'users'        AS table_name, count(*) FROM users
UNION ALL SELECT 'products',        count(*) FROM products
UNION ALL SELECT 'categories',      count(*) FROM categories
UNION ALL SELECT 'orders',          count(*) FROM orders
UNION ALL SELECT 'order_items',     count(*) FROM order_items
UNION ALL SELECT 'payments',        count(*) FROM payments
UNION ALL SELECT 'ui_settings',     count(*) FROM ui_settings
ORDER BY table_name;

\echo ''
\echo '== Confirm there is NOT already a tenants table (expect: relation does not exist OR 0 rows) =='
SELECT count(*) AS existing_tenants
FROM information_schema.tables
WHERE table_name = 'tenants';
