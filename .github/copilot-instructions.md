# Copilot Instructions for smoke-station-delivery

This React + Vite single-page app implements a delivery/shop UI using local in-memory state. Use these notes to make focused, safe changes.

## Big Picture Architecture

- **Frontend-only SPA** built with Vite. Key scripts: `npm run dev` (start), `npm run build` (production), `npm run preview`, `npm run lint`.
- **Client routing** via `react-router-dom` (see `src/main.jsx` — `BrowserRouter` wraps the app).
- **Centralized global state** in `src/context/AppContext.jsx`: products, orders, cart, currentUser, and auth/checkout flows.
- **No backend integration**: all data is mocked in `src/data/mockData.js` (initialProducts, initialOrders). Network calls do not exist in this repo.
- **Feature-based directory layout**: core logic lives in `src/features/{auth,cart,orders,products}` (mostly empty scaffolds); UI components in `src/components/`.

## Key Files & Patterns

**State & navigation hub:**
- `src/context/AppContext.jsx` — Exports `useApp()` hook and `AppProvider`. Manages login, logout, cart ops, product/order CRUD, and calls `useNavigate()` after state changes (e.g., `navigate('/products')` after login).

**Data shapes:**
- `src/data/mockData.js` — Canonical definitions of `initialProducts` (id, name, category, price, description, image, stock) and `initialOrders` (id, userId, status, total, items[], createdAt).

**App bootstrap:**
- `src/main.jsx` — Wraps App in `BrowserRouter`.
- `src/App.jsx` — Root component (currently a placeholder with counter demo).

## Conventions & Gotchas

- **State updates**: All mutations in `AppContext` use pure state setters (e.g., `setCart(prev => ...)`). Follow this pattern when adding features.
- **IDs**: Mock data uses simple numeric increments (`products.length + 1`). Replace if integrating a backend.
- **Navigation**: After auth, checkout, or product updates, `AppContext` calls `navigate()`. Verify routes exist before relying on these redirects.
- **UI confirmations**: Some flows use blocking `confirm()` and `alert()` dialogs inside context methods. Refactor cautiously if moving to async.
- **Empty scaffolds**: Feature folders (`src/features/*`) and `src/components/layout/` are present but empty — add new code there rather than cluttering root.

## Where to Make Changes

| Goal | Location | Pattern |
|------|----------|---------|
| Add new feature UI | `src/features/<feature>/` or `src/components/` | React component calling `useApp()` for state |
| Modify global state/API | `src/context/AppContext.jsx` | Add method to context, export via `value` object |
| Add sample data | `src/data/mockData.js` | Extend `initialProducts` or `initialOrders` |
| Layout/shared components | `src/components/layout/` | New component files here |

## Searching for Patterns

- Find state consumers: search `useApp()` to locate all context hooks.
- Find navigation flows: search `navigate(` to see all redirects.
- Confirm data shapes: open `src/data/mockData.js` for canonical property names.

## Safe AI Edits

- Keep public exports stable: `useApp`, `AppProvider` signatures must not break.
- Place new UI under `src/features/<feature>` to avoid conflicts.
- Test after edits: `npm run dev` starts HMR, `npm run lint` checks code style.
- When refactoring mocked flows (login, checkout), run the dev server and test login paths manually first.

---

**Questions?** Open an issue or update this file with clarifications for future agent runs.
