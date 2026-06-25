# React Query Migration Plan

> This is a future-state document. The prerequisite — splitting `AppContext` into focused contexts — must be complete first. See `docs/superpowers/specs/2026-06-25-appcontext-split-design.md`.

---

## Why React Query

After the context split, five of the six new contexts (`CatalogContext`, `OrdersContext`, `StoreConfigContext`, `NotificationsContext`, and parts of `AuthContext`) still use the same pattern: `useState` + `useEffect` + manual loading flags + `useCallback` fetch wrappers. This is hand-rolled server state management.

React Query replaces this pattern with a dedicated server-state library that handles:

- **Caching** — fetched data is cached by query key; navigating back to a page doesn't re-fetch
- **Background refetch** — stale data is refreshed automatically when the window regains focus
- **Loading/error states** — `isLoading`, `isError`, `data` are first-class instead of manual `useState` flags
- **Polling** — `refetchInterval` replaces `setInterval` wrappers
- **Mutations with cache invalidation** — after a write (create/update/delete), React Query can invalidate and refetch the affected queries automatically

---

## Migration Map

Each context becomes a set of React Query hooks. The context itself can be removed or reduced to a thin wrapper that calls the hooks.

### CatalogContext → `useProducts`, `useCategories`

```js
// Before (in CatalogContext)
const [products, setProducts] = useState([]);
const [isLoadingProducts, setIsLoadingProducts] = useState(false);
const loadProducts = useCallback(async () => {
  setIsLoadingProducts(true);
  const data = await api.getProducts();
  setProducts(data);
  setIsLoadingProducts(false);
}, []);

// After
const { data: products, isLoading: isLoadingProducts } = useQuery({
  queryKey: ['products'],
  queryFn: api.getProducts,
});
```

Product CRUD mutations with cache invalidation:
```js
const addProduct = useMutation({
  mutationFn: api.createProduct,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
});
```

Review mutations (currently optimistic local updates) can stay local or move to optimistic React Query mutations — both are supported.

---

### OrdersContext → `useOrders`

```js
const { data: orders, isLoading: isLoadingOrders } = useQuery({
  queryKey: ['orders'],
  queryFn: api.getOrders,
  refetchInterval: ORDER_POLL_INTERVAL_MS, // replaces setInterval
});
```

Order action mutations follow the same pattern as catalog — mutate, then `invalidateQueries(['orders'])`.

---

### StoreConfigContext → `useStoreConfig`

```js
const { data: storeConfig } = useQuery({
  queryKey: ['storeConfig'],
  queryFn: api.getStoreConfig,
  staleTime: 5 * 60 * 1000, // config rarely changes; 5 min stale time
});
```

`loadLandingPageData` becomes a separate query:
```js
const { data: landingPage } = useQuery({
  queryKey: ['landingPage'],
  queryFn: api.getLandingPageData,
});
```

---

### NotificationsContext → `useNotifications`

```js
// Polling replaces setInterval
const { data: notifications } = useQuery({
  queryKey: ['notifications'],
  queryFn: api.getNotifications,
  refetchInterval: NOTIFICATION_POLL_INTERVAL_MS,
  enabled: isAuthenticated, // auth guard
});

const { data: staffCounts } = useQuery({
  queryKey: ['staffCounts'],
  queryFn: api.getStaffCounts,
  refetchInterval: STAFF_COUNTS_POLL_INTERVAL_MS,
  enabled: isAuthenticated && isStaffRole,
});
```

`markNotificationRead` / `markAllRead` become mutations that invalidate `['notifications']`.

---

### AuthContext

Auth state (`currentUser`, `isAuthenticated`) stays in React context — it is client-owned session state, not server state. The exception is `creditBalance`, which is fetched from the server and is a natural fit for:

```js
const { data: creditBalance } = useQuery({
  queryKey: ['creditBalance', userId],
  queryFn: () => api.getCreditBalance(userId),
  enabled: !!userId,
});
```

---

## Consumer Migration

After React Query hooks exist, consumers can be migrated individually from `useApp()` to the focused hooks at any time — no flag day required.

```js
// Before
const { products, isLoadingProducts } = useApp();

// After
const { data: products, isLoading: isLoadingProducts } = useProducts();
```

The `useApp()` shim can be kept indefinitely or removed once all 74 consumers are migrated.

---

## Setup Required

1. Install React Query: `npm install @tanstack/react-query`
2. Wrap the app in `QueryClientProvider`:

```jsx
// web/src/main.jsx or App.jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

<QueryClientProvider client={queryClient}>
  <AppProvider>
    <App />
  </AppProvider>
</QueryClientProvider>
```

3. Optional: install React Query Devtools for development — `@tanstack/react-query-devtools`

---

## Recommended Migration Order

| Step | Work | Effort |
|---|---|---|
| 1 | Setup QueryClientProvider, install library | 1 hour |
| 2 | `useStoreConfig` — low complexity, no mutations | Half day |
| 3 | `useCategories` + mutations | Half day |
| 4 | `useProducts` + mutations + optimistic reviews | 1–2 days |
| 5 | `useOrders` + mutations, replace ORDER_POLL_INTERVAL | 1–2 days |
| 6 | `useNotifications` + polling, replace two intervals | 1 day |
| 7 | `creditBalance` query in AuthContext | 2 hours |
| 8 | Remove empty contexts, clean up shim | Half day |

Total: roughly one sprint. Each step is independently deployable.

---

## What React Query Does NOT Replace

- `AuthContext` (session state is client-owned)
- `CartContext` (localStorage-backed client state)
- `UIContext` (ephemeral UI state — toasts, navigation)
