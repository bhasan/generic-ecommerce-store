# Horizontal Scaling Plan

> Deferred from the June 2026 architecture review. These two items are prerequisites for running more than one backend instance. Neither is urgent for a single-server deployment but should be tackled in this order when horizontal scale becomes a requirement.

---

## Phase 1 — Redis (cache + job queues)

**Why first:** The in-process `settingsStore` TTL cache and any interval-based polling fire once per process. Under horizontal scale, each instance carries its own stale copy. Redis makes the cache shared and consistent across instances, and is a prerequisite for Phase 2 (upload URL signing) and the auth hardening refresh-token store.

**Scope:**

- Replace the module-level TTL cache in `settingsStore.ts` with a Redis-backed cache (e.g. `ioredis`). The `settingsStore` already documents this migration point.
- Replace the geocoding service module-level cache with the same Redis cache layer.
- Move any interval-based job polling (email, print jobs, notifications) to a Redis-backed queue (BullMQ is the natural fit given the existing Node stack).
- Add a Redis connection to `docker-compose.yml` and `docker-compose.prod.yml`.

**Migration path:** The `settingsStore` contract is already defined; the swap is localized to that file and the geocoding service. BullMQ wraps existing job logic — producers emit events, workers consume them.

---

## Phase 2 — Object Storage (S3/R2)

**Why second:** Requires Redis to be in place (presigned URL generation and CDN cache invalidation benefit from the shared cache). Local disk uploads (`multer.diskStorage` in `backend/src/config/multer.ts`, served from `/api/uploads/`) couple every media asset to a single machine. Zero-downtime redeploys and autoscaling are not possible without a shared volume.

**Scope:**

- Replace `multer.diskStorage` with `multer.memoryStorage()` — file lands in memory, gets streamed to S3/R2.
- Update `upload.controller.ts` to call the S3 SDK (`@aws-sdk/client-s3` or Cloudflare R2 via S3-compatible API) instead of writing to disk.
- Serve media via CDN URL rather than `/api/uploads/:filename`. Update all references in the frontend and admin image URLs.
- Remove the `uploads/` directory from the repo and from `docker-compose` volume mounts.
- Add `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` to `.env.example`.

**Cloudflare R2 note:** R2 is S3-compatible and has no egress fees — preferred over S3 if the app is already behind Cloudflare (see `cloudflare-ddns/` in the repo).

---

## Effort estimate

| Phase | Effort | Blocking dependency |
|---|---|---|
| Redis (Phase 1) | 3–5 days | None |
| Object storage (Phase 2) | 2–3 days | Redis in place |

Total: roughly one sprint for both phases.
