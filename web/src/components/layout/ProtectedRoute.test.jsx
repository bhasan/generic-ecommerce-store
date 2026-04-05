import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUEST_USER } from '../../utils/roles';

vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
    useLocation: () => ({ pathname: '/dashboard' }),
  };
});

describe('ProtectedRoute', () => {
  it('redirects guests to login', async () => {
    const { useApp } = await import('../../context/AppContext');
    useApp.mockReturnValue({
      currentUser: GUEST_USER,
      setReturnPath: vi.fn(),
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(<ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>);

    expect(screen.getByTestId('navigate')).toHaveTextContent('/login');
  });

  it('stores the current path before redirecting guests', async () => {
    const { useApp } = await import('../../context/AppContext');
    const setReturnPath = vi.fn();
    useApp.mockReturnValue({
      currentUser: GUEST_USER,
      setReturnPath,
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(<ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>);

    expect(setReturnPath).toHaveBeenCalledWith('/dashboard');
  });

  it('renders children when a legacy single-role user satisfies the requirement', async () => {
    const { useApp } = await import('../../context/AppContext');
    useApp.mockReturnValue({
      currentUser: { id: 4, username: 'admin-one', role: 'ADMIN' },
      setReturnPath: vi.fn(),
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(<ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>);

    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});
