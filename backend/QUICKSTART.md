# Backend Quick Start

This file is intentionally short to avoid duplicating stale setup instructions.

Use the root quick start for the current local Docker workflow:

- `../README.md`
- `../LOCAL_DOCKER_DEV_WORKFLOW.md`

For backend-only local development:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

The API runs on `http://localhost:3000` by default.

Current auth behavior is username-based, and new registrations require approval before login.
