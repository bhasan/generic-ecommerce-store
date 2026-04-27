# Incident: Production Product Image Upload/Save Failure

Date observed: April 26, 2026  
Environment: Production (`smoke-station-delivery-backend-prod`)

## Summary

Product image uploads in production failed, and product save requests returned `400` after upload attempts.

Two distinct root causes were identified in sequence:

1. Upload write-permission failure in backend container (`EACCES` on `/app/uploads`).
2. Frontend sent `image: null` in product update payload, which backend validator rejects (`image` must be string if present).

## Symptoms

- Upload endpoint error:
  - `POST /api/upload` returned `500`
  - Backend log contained: `EACCES: permission denied, open '/app/uploads/<file>'`
- Product save error after upload attempt:
  - `PUT /api/products/:id` returned `400`
  - Validation log contained: `Invalid value` for path `image`

## Root Cause Analysis

### Root Cause 1: Container upload directory permissions

- Backend process runs as non-root user (`uid=1001`, `nodejs`).
- Mounted uploads volume path `/app/uploads` was owned by `root:root` with `755`.
- Non-root backend user could not create files in `/app/uploads`.

Validation used:

- `id && ls -ld /app /app/uploads && stat -c '%u:%g %a %n' /app/uploads`
- Write test as app user:
  - `node -e "require('fs').writeFileSync('/app/uploads/.perm-test','ok')"`
  - Failed with `EACCES` before fix.

### Root Cause 2: Frontend payload included `image: null`

- After permissions fix, upload returned a valid thumbnail URL.
- Product update request still sent:
  - `thumbnail: "/api/uploads/<file>.webp"`
  - `image: null`
- Backend route validator for `image` is `optional().isString()`, so `null` is invalid when key is present.

## Fixes Applied

### 1) Production container filesystem ownership fix

Executed on production container:

```bash
docker exec -u 0 smoke-station-delivery-backend-prod sh -lc "chown -R 1001:65533 /app/uploads && chmod 775 /app/uploads"
```

Re-validation:

- App-user write test to `/app/uploads` succeeded.
- Upload endpoint stopped returning `EACCES`.

### 2) Frontend payload hardening for product save

Updated frontend save logic to ensure `image` is:

- sent only when it is a non-empty string, or
- omitted entirely otherwise.

Changed files:

- `web/src/features/products/ManageProductsPanel.jsx`
- `web/src/features/products/ManageProductsPanel.test.jsx`

Commit:

- `8d8076a` (`Fix product edit payload to omit null image`)

## Why This Was Safe

- Root causes were confirmed from logs and direct runtime validation before code changes.
- Frontend fix is scoped to payload shaping only; no API contract expansion.
- Added test coverage for edit scenario where `thumbnail` exists and `image` is `null`.

## Prevention / Follow-ups

1. Add container startup guard to ensure `/app/uploads` exists and is writable by app user.
2. Consider backend defensive validation:
   - `body('image').optional({ nullable: true }).isString()`
   - Only if accepting `null` is desired contract behavior.
3. Add production smoke test:
   - upload file + save product end-to-end.

