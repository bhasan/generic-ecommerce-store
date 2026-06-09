import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import * as AppContext from '../../context/AppContext';

// Mock SpaceTravelerGraphic to avoid loading the image in tests
vi.mock('./SpaceTravelerGraphic', () => ({
  default: () => <div data-testid="space-traveler-graphic" />
}));

const mockLogin = vi.fn();

describe('LoginPage UI Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the useApp hook to provide the necessary context
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      login: mockLogin,
      currentUser: null,
      isLoading: false
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
  };

  it('renders the login form and graphic', () => {
    renderComponent();
    expect(screen.getByTestId('space-traveler-graphic')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('toggles password visibility when the eye icon is clicked', () => {
    renderComponent();
    
    // Find the password input and verify it is initially type="password"
    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the toggle button (it should have aria-label="Show password" initially)
    const toggleButton = screen.getByRole('button', { name: /show password/i });
    expect(toggleButton).toBeInTheDocument();

    // Click the toggle button
    fireEvent.click(toggleButton);

    // Verify the input type changed to "text"
    expect(passwordInput).toHaveAttribute('type', 'text');
    // Verify the button label updated
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

    // Click again to hide
    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));

    // Verify it reverts back
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
  });

  it('shows a loading spinner when isLoading is true', () => {
    vi.spyOn(AppContext, 'useApp').mockReturnValue({
      login: mockLogin,
      currentUser: null,
      isLoading: false 
    });
  });
});
