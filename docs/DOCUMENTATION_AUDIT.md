# Documentation Audit

## Summary

| Category | Count |
|---|---:|
| Canonical | 5 |
| Active Reference | 13 |
| Historical / Archive | 2 |
| Generated Artifact | 0 |
| Stale / Remove | 0 |
| Duplicate / Merge | 2 |
| Needs Verification | 1 |

## Cleanup Summary

- Updated canonical README guidance to match current npm scripts, Docker dev ports, and Mermaid documentation tooling.
- Added documentation-cleanup safety guidance to `AGENTS.md`.
- Replaced stale backend auth/API examples with current backend pointers.
- Replaced the default Vite frontend README with project-specific frontend pointers.
- Archived the generated Docker build success report under `docs/archive/`.
- Labeled old backend context notes as historical / needs verification.
- Corrected the project design documentation screenshot drift note.

## File Inventory

| File | Category | Action | Reason | Codebase Verification |
|---|---|---|---|---|
| `README.md` | Canonical | Updated | Main repo entrypoint | Verified against root, backend, and web `package.json`; Docker compose dev port mapping; docs render script |
| `AGENTS.md` | Canonical | Updated | Project agent workflow | Verified against current docs workflow and no-behavior-change cleanup requirement |
| `docs/DESIGN_DOCUMENTATION_INSTRUCTIONS.md` | Canonical | Kept / previously updated | Defines design-document workflow | Verified against `docs/PROJECT_DESIGN.md` and Mermaid render script |
| `docs/PROJECT_DESIGN.md` | Canonical | Updated drift note | Current app design reference | Spot-checked routes in `web/src/App.jsx`, backend routes in `backend/src/routes`, screenshots, and diagram references |
| `docs/DOCUMENTATION_AUDIT.md` | Canonical | Created | Required audit map for documentation cleanup | Based on current repo inventory |
| `CODEBASE_WORKING_DOCUMENT.md` | Active Reference | Kept | Current engineering inventory and merge-sensitive behavior notes | Consistent with code/source-truth guidance; not fully revalidated line-by-line |
| `LOCAL_DOCKER_DEV_WORKFLOW.md` | Active Reference | Kept | Current Docker dev workflow | Verified against `docker-compose.yml` and `docker-compose.dev.yml` |
| `MONITORING.md` | Active Reference | Kept | Operational monitoring reference | Needs deeper operational validation before merging into canonical deployment docs |
| `OPERATIONS_PIPELINE.md` | Active Reference | Kept | Deployment/package pipeline reference | Version tag examples are placeholders; commands should be verified before release use |
| `PRODUCTION_DEPLOYMENT.md` | Active Reference | Kept | Production compose deployment reference | Verified presence of `docker-compose.prod.yml`; not fully deployment-tested in this pass |
| `DEPLOYMENT_CHECKLIST.md` | Active Reference | Kept | Release checklist | Uses example image tags; keep as checklist, verify per deployment |
| `DOCKER_COMMANDS.md` | Active Reference | Kept | Docker command reference | Some cleanup examples are generic; not merged in this pass |
| `DOCKER_SETUP.md` | Active Reference | Kept | Docker setup reference | Overlaps README/local workflow, but still useful as detailed reference |
| `docs/MERMAID_SVG_RENDERING_FIX.md` | Active Reference | Updated | Reusable Mermaid SVG workflow note | Verified against `scripts/render-design-mermaid.js`, `package.json`, and manifest |
| `backend/README.md` | Active Reference | Replaced stale content | Package-local backend guide | Verified against `backend/src/routes/auth.routes.ts`, backend package scripts, and root workflow |
| `backend/QUICKSTART.md` | Active Reference | Replaced stale content | Backend quick-start pointer | Verified against backend package scripts and current username-based auth |
| `backend/MAKE_OUTBOUND_NOTIFICATION_FLOW.md` | Active Reference | Kept | Make webhook/notification reference | Consistent with notification delivery service naming; not fully revalidated line-by-line |
| `web/README.md` | Active Reference | Replaced template content | Package-local frontend guide | Verified against `web/package.json`, `web/src/App.jsx`, and `web/vite.config.js` |
| `INCIDENT_2026-04-26_prod_image_upload_failure.md` | Historical / Archive | Kept in place | Useful historical production incident | Clearly dated incident record; still relevant for upload/product payload prevention |
| `docs/archive/BUILD_SUCCESS_REPORT.md` | Historical / Archive | Archived from repo root | Generated build report with old runtime output | Preserved for context; header marks it as historical and not current truth |
| `DOCKER_INDEX.md` | Duplicate / Merge | Kept for now | Navigation overlaps README and Docker docs | Could be merged into README / `LOCAL_DOCKER_DEV_WORKFLOW.md` later |
| `DOCKER_SUMMARY.md` | Duplicate / Merge | Kept for now | Architecture summary overlaps Docker setup docs | Could be merged or replaced with pointer later |
| `backend/BACKEND_CONTEXT.md` | Needs Verification | Marked historical / needs verification | Contains older email/name auth and schema examples | Current code uses username auth and current Prisma schema differs from older notes |

## Verification Notes

- Frontend routes were spot-checked in `web/src/App.jsx`.
- Backend route files were spot-checked in `backend/src/routes/*.ts`.
- Current auth registration fields were verified in `backend/src/routes/auth.routes.ts`.
- Current scripts were verified in root, backend, and web `package.json`.
- Docker dev ports were verified in `docker-compose.dev.yml`.
- Mermaid SVG references were verified in `docs/PROJECT_DESIGN.md`.

## Remaining Needs Verification

- `DOCKER_INDEX.md`, `DOCKER_SUMMARY.md`, `DOCKER_SETUP.md`, and `DOCKER_COMMANDS.md` still overlap. A future pass should merge duplicated Docker guidance into `README.md` and `LOCAL_DOCKER_DEV_WORKFLOW.md`, then replace extra files with pointers if external links need preserving.
- `OPERATIONS_PIPELINE.md` and `PRODUCTION_DEPLOYMENT.md` should be validated against a real target deployment before release use.
- `backend/BACKEND_CONTEXT.md` should either be rewritten from current code or archived after confirming no active workflow depends on it.
