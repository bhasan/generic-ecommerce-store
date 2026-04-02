import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
      currentUser: { email: 'guest@guest.com', roles: ['GUEST'] },
      setReturnPath: vi.fn(),
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(<ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>);

    expect(screen.getByTestId('navigate')).toHaveTextContent('/login');
  });

  it('renders children when role requirement is met', async () => {
    const { useApp } = await import('../../context/AppContext');
    useApp.mockReturnValue({
      currentUser: { email: 'admin@test.com', roles: ['ADMIN'] },
      setReturnPath: vi.fn(),
    });
    const { default: ProtectedRoute } = await import('./ProtectedRoute');

    render(<ProtectedRoute roles={['ADMIN']}><div>Secret</div></ProtectedRoute>);

    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});
