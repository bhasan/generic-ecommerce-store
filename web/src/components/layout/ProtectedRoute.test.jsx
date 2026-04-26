import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GUEST_USER } from '../../utils/roles';

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(),
  AppProvider: ({ children }) => children,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateSpy,
    useLocation: () => ({ pathname: '/dashboard' }),
  };
});

import { MemoryRouter } from 'react-router-dom';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects guests to login', async () => {
    const { useApp } = await import('../../context/AppContext');
    useApp.mockReturnValue({
      currentUser: GUEST_USER,
      isLoading: false,
      setReturnPath: vi.fn(),
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('stores the current path before redirecting guests', async () => {
    const { useApp } = await import('../../context/AppContext');
    const setReturnPath = vi.fn();
    useApp.mockReturnValue({
      currentUser: GUEST_USER,
      isLoading: false,
      setReturnPath,
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(setReturnPath).toHaveBeenCalledWith('/dashboard');
      expect(navigateSpy).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('renders children when a legacy single-role user satisfies the requirement', async () => {
    const { useApp } = await import('../../context/AppContext');
    useApp.mockReturnValue({
      currentUser: { id: 4, username: 'admin-one', role: 'ADMIN' },
      isLoading: false,
      setReturnPath: vi.fn(),
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Secret')).toBeInTheDocument();
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('waits for auth bootstrap before redirecting guests', async () => {
    const { useApp } = await import('../../context/AppContext');
    const setReturnPath = vi.fn();
    useApp.mockReturnValue({
      currentUser: GUEST_USER,
      isLoading: true,
      setReturnPath,
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>
      </MemoryRouter>
    );

    // Should show loading state
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    
    // Should NOT have navigated or set return path yet
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(setReturnPath).not.toHaveBeenCalled();
  });
});
