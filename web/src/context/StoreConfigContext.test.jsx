// web/src/context/StoreConfigContext.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { StoreConfigProvider, useStoreConfigContext } from './StoreConfigContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));

import * as configApi from '../services/configApi';
import * as landingPageSettingsApi from '../services/landingPageSettingsApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>{children}</StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('StoreConfigContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes default taxRate of 0', () => {
    const { result } = renderHook(() => useStoreConfigContext(), { wrapper });
    expect(result.current.taxRate).toBe(0);
  });

  it('loadConfig populates taxRate from API', async () => {
    configApi.getConfig.mockResolvedValue({ taxRate: 0.1, storeSettings: { name: 'Test' } });
    const { result } = renderHook(() => useStoreConfigContext(), { wrapper });
    await result.current.loadConfig();
    await waitFor(() => expect(result.current.taxRate).toBe(0.1));
  });

  it('throws when used outside StoreConfigProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider>{children}</AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useStoreConfigContext(), { wrapper: miniWrapper }))
      .toThrow('useStoreConfigContext must be used within StoreConfigProvider');
  });
});
