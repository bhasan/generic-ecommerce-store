// web/src/context/AppContext.jsx
import React, { createContext, useContext } from 'react';
import { UIProvider, useUIContext } from './UIContext';
import { AuthProvider, useAuthContext } from './AuthContext';
import { StoreConfigProvider, useStoreConfigContext } from './StoreConfigContext';
import { CatalogProvider, useCatalogContext } from './CatalogContext';
import { NotificationsProvider, useNotificationsContext } from './NotificationsContext';
import { OrdersProvider, useOrdersContext } from './OrdersContext';
import { CartProvider, useCartContext } from './CartContext';
import { StoreSelectionProvider, useStoreSelection } from './StoreSelectionContext';

export { useStoreSelection };

const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

function AppValueProvider({ children }) {
  const ui = useUIContext();
  const auth = useAuthContext();
  const storeConfig = useStoreConfigContext();
  const catalog = useCatalogContext();
  const notifications = useNotificationsContext();
  const orders = useOrdersContext();
  const cart = useCartContext();
  const { loading: storeLoading, ...storeSelectionRest } = useStoreSelection();

  const value = {
    ...ui,
    ...auth,
    ...storeConfig,
    // Alias for legacy consumers — scope is landing page data only (products/categories live in CatalogContext)
    refreshStorefrontData: storeConfig.refreshLandingPageData,
    ...catalog,
    ...notifications,
    ...orders,
    ...cart,
    // Spread store-selection fields but expose `loading` as `storeLoading` so it cannot
    // shadow a `loading` key from auth/cart/catalog or any other context in this merge.
    ...storeSelectionRest,
    storeLoading,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }) {
  return (
    <UIProvider>
      <AuthProvider>
        <StoreSelectionProvider>
          <StoreConfigProvider>
            <CatalogProvider>
              <NotificationsProvider>
                <OrdersProvider>
                  <CartProvider>
                    <AppValueProvider>
                      {children}
                    </AppValueProvider>
                  </CartProvider>
                </OrdersProvider>
              </NotificationsProvider>
            </CatalogProvider>
          </StoreConfigProvider>
        </StoreSelectionProvider>
      </AuthProvider>
    </UIProvider>
  );
}
