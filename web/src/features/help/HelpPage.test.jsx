import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import HelpPage from './HelpPage';

const useAppMock = vi.hoisted(() => vi.fn());
vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

// ContactForm has its own API/context dependencies; stub it so this test
// stays focused on HelpPage rendering.
vi.mock('./ContactForm', () => ({
  default: () => <div data-testid="contact-form" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>
  );

describe('HelpPage', () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({ currentUser: { roles: ['CUSTOMER'] } });
    vi.clearAllMocks();
  });

  // Regression: the "Online Support" card renders a <MessageCircle /> icon that
  // was used without being imported, crashing the whole page via the error
  // boundary (ReferenceError: MessageCircle is not defined).
  it('renders without crashing, including the Online Support card', () => {
    renderPage();
    expect(screen.getByText('How Can We Help?')).toBeInTheDocument();
    expect(screen.getByText('Online Support')).toBeInTheDocument();
  });
});
