import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext';
import { sampleConfig, sampleProducts, sampleCategories } from '../test/appFixtures';

// Mock API modules
const authApi = vi.hoisted(() => ({ getProfile: vi.fn(), login: vi.fn(), refresh: vi.fn() }));
const productsApi = vi.hoisted(() => ({ getAllProducts: vi.fn() }));
const categoriesApi = vi.hoisted(() => ({ getAllCategories: vi.fn() }));
const configApi = vi.hoisted(() => ({ getConfig: vi.fn() }));
const notificationsApi = vi.hoisted(() => ({
  getNotifications: vi.fn().mockResolvedValue([]),
  getUnreadNotificationCount: vi.fn().mockResolvedValue({ count: 0 }),
  getStaffNotificationCounts: vi.fn().mockResolvedValue(null),
}));
const apiModule = vi.hoisted(() => ({ getAuthToken: vi.fn(), getRefreshToken: vi.fn() }));

vi.mock('../services/authApi', () => authApi);
vi.mock('../services/productsApi', () => productsApi);
vi.mock('../services/categoriesApi', () => categoriesApi);
vi.mock('../services/configApi', () => configApi);
vi.mock('../services/notificationsApi', () => notificationsApi);
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return { ...actual, getAuthToken: apiModule.getAuthToken };
});

function ContextHarness() {
  const { isAuthenticated, products, categories, taxRate, isLoading } = useApp();
  const location = useLocation();

  if (isLoading) return <div data-testid="loading">Loading...</div>;

  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="products-loaded">{products.length > 0 ? 'yes' : 'no'}</div>
      <div data-testid="categories-loaded">{categories.length > 0 ? 'yes' : 'no'}</div>
      <div data-testid="config-loaded">{taxRate > 0 ? 'yes' : 'no'}</div>
    </div>
  );
}

describe('AppContext Guarding Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiModule.getAuthToken.mockReturnValue(null);
    configApi.getConfig.mockResolvedValue(sampleConfig);
    productsApi.getAllProducts.mockResolvedValue(sampleProducts);
    categoriesApi.getAllCategories.mockResolvedValue(sampleCategories);
  });

  it('skips all data fetching on /login for guest users', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppProvider>
          <ContextHarness />
        </AppProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('products-loaded')).toHaveTextContent('no');
    expect(screen.getByTestId('categories-loaded')).toHaveTextContent('no');
    expect(screen.getByTestId('config-loaded')).toHaveTextContent('no');
    
    expect(productsApi.getAllProducts).not.toHaveBeenCalled();
    expect(categoriesApi.getAllCategories).not.toHaveBeenCalled();
    expect(configApi.getConfig).not.toHaveBeenCalled();
  });

  it('loads config but not products/categories on /register for guest users', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <AppProvider>
          <ContextHarness />
        </AppProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('products-loaded')).toHaveTextContent('no');
    expect(screen.getByTestId('categories-loaded')).toHaveTextContent('no');
    
    // Config should be loaded on register page
    await waitFor(() => expect(screen.getByTestId('config-loaded')).toHaveTextContent('yes'));
    expect(configApi.getConfig).toHaveBeenCalled();
    
    expect(productsApi.getAllProducts).not.toHaveBeenCalled();
    expect(categoriesApi.getAllCategories).not.toHaveBeenCalled();
  });

  it('loads all data after a user authenticates', async () => {
    apiModule.getAuthToken.mockReturnValue('valid-token');
    authApi.getProfile.mockResolvedValue({ id: 1, username: 'user', roles: ['CUSTOMER'] });

    render(
      <MemoryRouter initialEntries={['/products']}>
        <AppProvider>
          <ContextHarness />
        </AppProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    
    await waitFor(() => {
      expect(screen.getByTestId('products-loaded')).toHaveTextContent('yes');
      expect(screen.getByTestId('categories-loaded')).toHaveTextContent('yes');
      expect(screen.getByTestId('config-loaded')).toHaveTextContent('yes');
    });

    expect(productsApi.getAllProducts).toHaveBeenCalled();
    expect(categoriesApi.getAllCategories).toHaveBeenCalled();
    expect(configApi.getConfig).toHaveBeenCalled();
  });
});
