# AppContext Split — Design Spec

> Reviewed against commit `08f6872` on branch `refactors_6-25`, June 2026.

---

## Goal

Break `web/src/context/AppContext.jsx` (1,280 lines, 74 consumers) into 6 focused contexts. No consumer files change. No new libraries. `useApp()` continues to work identically via a thin compatibility shim.

---

## Contexts

### AuthContext
**File:** `web/src/context/AuthContext.jsx`

Owns everything related to the current session and user identity.

State: `currentUser`, `isAuthenticated`, `isLoading`

Functions: `login`, `logout`, `register`, `updateUserProfile`, `creditBalance`, `refreshCreditBalance`, `checkDeliveryEligibility`

Notes:
- Initializes `currentUser` from `localStorage.getItem('userData')` on mount (existing behavior preserved)
- Revalidates the saved token on mount via `getAuthToken()` (existing behavior preserved)
- `checkDeliveryEligibility` lives here because it is scoped to the authenticated user's address

---

### CartContext
**File:** `web/src/context/CartContext.jsx`

Owns the shopping cart and checkout flow.

State: `cart`

Functions: `addToCart`, `removeFromCart`, `updateCartQuantity`, `checkout`, `restoreCart`

Notes:
- Cart is persisted to `localStorage` under `CART_STORAGE_KEY = 'cartData_v2'` (existing behavior preserved)
- `checkout` calls the orders API and on success clears the cart — it does NOT own orders state; it triggers a side effect that `OrdersContext` will pick up on next load
- `checkout` calls `showNotification` — it must receive `showNotification` via the context composition in the shim, not by importing `UIContext` directly (avoids circular dependency). Pass it as a prop to `CartProvider` or accept it via a callback parameter.

---

### UIContext
**File:** `web/src/context/UIContext.jsx`

Owns ephemeral UI state that has no server counterpart.

State: `notification` (toast), `returnPath`

Functions: `showNotification`, `closeNotification`, `setReturnPath`

Notes:
- This is the only context with no API calls
- `showNotification(message, type, action)` — existing signature preserved

---

### CatalogContext
**File:** `web/src/context/CatalogContext.jsx`

Owns the product and category catalog, including all CRUD operations and review interactions.

State: `products`, `isLoadingProducts`, `categories`, `isLoadingCategories`

Functions: `loadProducts`, `loadCategories`, `addProduct`, `updateProduct`, `deleteProduct`, `createCategory`, `updateCategory`, `deleteCategory`, `addReview`, `updateReview`, `deleteReview`, `addReviewReply`, `voteReview`, `flagReview`

Notes:
- Review mutations are optimistic local updates (no API round-trip) — existing behavior preserved
- `loadProducts` and `loadCategories` are fetched independently; neither blocks the other

---

### OrdersContext
**File:** `web/src/context/OrdersContext.jsx`

Owns order history and all order management actions.

State: `orders`, `isLoadingOrders`

Functions: `loadOrders`, `setOrders`, `updateOrderStatus`, `notifyArrival`, `deleteOrder`, `printOrderReceipt`, `addItemToOrder`, `voidOrderItem`, `deleteOrderItem`, `restoreOrder`

Notes:
- `loadOrders(silent)` — silent flag suppresses loading spinner, used for background polling; existing behavior preserved
- Order polling (`ORDER_POLL_INTERVAL_MS`) moves here from AppContext

---

### StoreConfigContext
**File:** `web/src/context/StoreConfigContext.jsx`

Owns store-wide configuration fetched from the server.

State: `taxRate`, `minimumDeliveryOrder`, `minimumDeliveryOrderEnabled`, `deliveryDisabled`, `deliveryDisabledMessage`, `deliveryRadiusMiles`, `pickupLocation`, `featuredProductIds`, `promotions`, `storeCashappUsername`, `paymentSettings`, `storeSettings`, `branding`

Functions: `loadConfig`, `loadLandingPageData`, `refreshStorefrontData`

Notes:
- `loadConfig` fetches store settings + payment settings in one call
- `loadLandingPageData` fetches featured products, promotions, branding
- `refreshStorefrontData` calls both and is used on storefront mount

---

### NotificationsContext
**File:** `web/src/context/NotificationsContext.jsx`

Owns the staff notification inbox and polling.

State: `inboxNotifications`, `unreadNotificationCount`, `staffNotificationCounts`, `notificationsMuted`

Functions: `loadNotifications`, `loadUnreadNotificationCount`, `loadStaffNotificationCounts`, `refreshNotifications`, `handleNotificationsPanelOpen`, `markNotificationRead`, `markAllNotificationsRead`, `toggleNotificationsMuted`, `playStaffAttentionSound`

Notes:
- `NOTIFICATION_POLL_INTERVAL_MS` and `STAFF_COUNTS_POLL_INTERVAL_MS` polling intervals move here
- Polling only runs when user is authenticated — check `isAuthenticated` from `AuthContext`
- `notificationsMuted` is persisted to `localStorage` (existing behavior preserved)

---

## Compatibility Shim

**File:** `web/src/context/AppContext.jsx` (gutted, ~60 lines)

`AppProvider` nests all 6 providers in the correct order:

```
UIProvider
  AuthProvider
    StoreConfigProvider
      CatalogProvider
        OrdersProvider
          NotificationsProvider
            {children}
```

`useApp()` merges all 6 context values into one object — identical shape to today. All 74 consumers continue to call `useApp()` without changes.

Provider order rationale:
- `UIContext` outermost — needed by all others for `showNotification`
- `AuthContext` second — needed by Notifications for the auth guard
- `StoreConfigContext` before Catalog/Orders — config is needed at storefront boot

---

## Testing

Each new context file gets a colocated test:
- `AuthContext.test.jsx` — login, logout, token revalidation on mount
- `CartContext.test.jsx` — add/remove/update, localStorage persistence, checkout clears cart
- `UIContext.test.jsx` — showNotification sets state, closeNotification clears it
- `CatalogContext.test.jsx` — loadProducts, loadCategories, optimistic review mutations
- `OrdersContext.test.jsx` — loadOrders, updateOrderStatus, silent flag behavior
- `StoreConfigContext.test.jsx` — loadConfig, loadLandingPageData
- `NotificationsContext.test.jsx` — polling setup, mute toggle, markRead

Existing `AppContext.*.test.jsx` files are preserved unchanged — they mock `useApp()` and still work through the shim.

Shim smoke test: `AppContext.shim.test.jsx` — verifies `useApp()` returns an object containing at least the keys from all 6 contexts.

---

## What Does NOT Change

- `useApp()` hook signature — identical
- All 74 consumer files — no imports changed
- `web/src/services/api.js` — unchanged
- `web/src/App.jsx` — `<AppProvider>` call unchanged

---

## Out of Scope

- React Query migration (see `docs/REACT_QUERY_MIGRATION.md`)
- Any changes to backend
- Migrating individual consumers away from `useApp()` to focused context hooks
