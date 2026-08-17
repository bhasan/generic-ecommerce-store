# Generic Ecommerce Store Web

This package contains the React/Vite frontend for Generic Ecommerce Store.

Current source of truth:

- App routes: `src/App.jsx`
- Feature screens: `src/features/`
- Shared layout/components: `src/components/`
- API clients: `src/services/`
- Project-level design reference: `../docs/PROJECT_DESIGN.md`
- Root setup and Docker workflow: `../README.md`, `../LOCAL_DOCKER_DEV_WORKFLOW.md`

## Common Commands

```bash
npm install
npm run dev
npm test
npm run build
```

The local Vite dev server uses port `5843` in the Docker dev workflow. API requests are proxied through `web/vite.config.js` during local development.
