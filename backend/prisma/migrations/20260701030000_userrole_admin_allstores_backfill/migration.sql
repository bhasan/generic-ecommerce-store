-- Promote pre-Phase-2 provisioned tenant-admin roles (pinned to their tenant's
-- real default store) to the all-stores sentinel (0), matching current provisioning
-- (storeId 0) and role.middleware's all-stores semantics. Scoped to ADMIN rows whose
-- storeId equals their tenant's default store, so genuinely store-scoped staff and
-- admins already at 0 / at a non-default store are untouched.
UPDATE "user_roles" ur
SET "storeId" = 0
FROM "stores" s
WHERE ur."storeId" = s."id"
  AND s."isDefault" = true
  AND s."tenantId" = ur."tenantId"
  AND ur."roleId" IN (SELECT "id" FROM "roles" WHERE "name" = 'ADMIN');
