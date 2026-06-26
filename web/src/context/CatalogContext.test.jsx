// web/src/context/CatalogContext.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { CatalogProvider, useCatalogContext } from './CatalogContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { StoreConfigProvider } from './StoreConfigContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/productsApi', () => ({
  getAllProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));
vi.mock('../services/categoriesApi', () => ({
  getAllCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(), refresh: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), getRefreshToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));

import * as productsApi from '../services/productsApi';
import * as categoriesApi from '../services/categoriesApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>
          <CatalogProvider>{children}</CatalogProvider>
        </StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('CatalogContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty products and categories', () => {
    const { result } = renderHook(() => useCatalogContext(), { wrapper });
    expect(result.current.products).toEqual([]);
    expect(result.current.categories).toEqual([]);
  });

  it('loadProducts populates products from API', async () => {
    productsApi.getAllProducts.mockResolvedValue([{ id: 1, name: 'Widget' }]);
    const { result } = renderHook(() => useCatalogContext(), { wrapper });
    await result.current.loadProducts();
    await waitFor(() => expect(result.current.products).toHaveLength(1));
    expect(result.current.products[0].name).toBe('Widget');
  });

  it('loadCategories populates categories from API', async () => {
    categoriesApi.getAllCategories.mockResolvedValue([{ id: 1, name: 'Flowers' }]);
    const { result } = renderHook(() => useCatalogContext(), { wrapper });
    await result.current.loadCategories();
    await waitFor(() => expect(result.current.categories).toHaveLength(1));
  });

  it('throws when used outside CatalogProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider><StoreConfigProvider>{children}</StoreConfigProvider></AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useCatalogContext(), { wrapper: miniWrapper }))
      .toThrow('useCatalogContext must be used within CatalogProvider');
  });
});
