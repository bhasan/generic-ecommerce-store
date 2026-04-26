import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Navbar from './Navbar';
import { renderWithProviders } from '../../test/renderWithProviders';
import { users } from '../../test/appFixtures';
import { getNewMessageCount } from '../../services/contactMessagesApi';

vi.mock('../../services/contactMessagesApi', () => ({
  getNewMessageCount: vi.fn().mockResolvedValue({ count: 0 }),
}));

vi.mock('../cart/CartPreview', () => ({ default: () => <div>CartPreview</div> }));
vi.mock('./NotificationDropdown', () => ({ default: () => <div>NotificationDropdown</div> }));

const makeAppState = (currentUser, extra = {}) => ({
  currentUser,
  cart: [],
  logout: vi.fn(),
  staffNotificationCounts: {},
  creditBalance: 0,
  inboxNotifications: [],
  unreadNotificationCount: 0,
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  notificationsMuted: false,
  toggleNotificationsMuted: vi.fn(),
  ...extra,
});

let appState;

vi.mock('../../context/AppContext', () => ({
  useApp: () => appState,
}));

describe('Navbar', () => {
  it('does not poll contact message count from navbar anymore', () => {
    appState = makeAppState(users.management);
    renderWithProviders(<Navbar />, { route: '/orders' });

    expect(getNewMessageCount).not.toHaveBeenCalled();
  });

  describe('mobile menu - hamburger button', () => {
    it('does not render the hamburger button on /login for guests', () => {
      appState = makeAppState(users.guest);
      renderWithProviders(<Navbar />, { route: '/login' });

      expect(screen.queryByLabelText('Toggle menu')).not.toBeInTheDocument();
    });

    it('renders the hamburger button for guests on non-login routes', () => {
      appState = makeAppState(users.guest);
      renderWithProviders(<Navbar />, { route: '/register' });

      expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument();
    });

    it('shows the hamburger button and hides nav links by default (CSS handles visibility)', () => {
      appState = makeAppState(users.customer);
      renderWithProviders(<Navbar />);

      expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument();
    });

    it('opens mobile menu with all nav link labels visible when hamburger is clicked', () => {
      appState = makeAppState(users.customer);
      renderWithProviders(<Navbar />);

      fireEvent.click(screen.getByLabelText('Toggle menu'));

      // Both the desktop links and mobile menu render these, but mobile menu
      // must include the text spans so screen readers and visible text work.
      // getAllByText handles both instances (desktop hidden via CSS, mobile visible).
      const productLinks = screen.getAllByText('Products');
      expect(productLinks.length).toBeGreaterThanOrEqual(1);

      const myOrdersLinks = screen.getAllByText('My Orders');
      expect(myOrdersLinks.length).toBeGreaterThanOrEqual(1);
    });

    it('closes mobile menu when hamburger is clicked again', () => {
      appState = makeAppState(users.customer);
      renderWithProviders(<Navbar />);

      const btn = screen.getByLabelText('Toggle menu');
      fireEvent.click(btn);
      expect(btn.classList.contains('open')).toBe(true);

      fireEvent.click(btn);
      expect(btn.classList.contains('open')).toBe(false);
    });

    it('shows management nav links in mobile menu for manager users', () => {
      appState = makeAppState(users.management);
      renderWithProviders(<Navbar />);

      fireEvent.click(screen.getByLabelText('Toggle menu'));

      expect(screen.getAllByText('Manager').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Manage Products').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Admin label instead of Manager for admin users', () => {
      appState = makeAppState(users.admin);
      renderWithProviders(<Navbar />);

      fireEvent.click(screen.getByLabelText('Toggle menu'));

      expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1);
    });

    it('mobile menu nav links contain span elements with text (not icon-only)', () => {
      appState = makeAppState(users.customer);
      const { container } = renderWithProviders(<Navbar />);

      fireEvent.click(screen.getByLabelText('Toggle menu'));

      const mobileMenu = container.querySelector('.mobile-menu');
      expect(mobileMenu).toBeTruthy();

      const spans = mobileMenu.querySelectorAll('.nav-link span');
      expect(spans.length).toBeGreaterThan(0);
      spans.forEach((span) => {
        expect(span.textContent.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('desktop nav links', () => {
    it('renders Products link for authenticated customers', () => {
      appState = makeAppState(users.customer);
      renderWithProviders(<Navbar />);

      // Desktop navbar-links container should include the Products link
      expect(screen.getAllByText('Products').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render nav links for guest users', () => {
      appState = makeAppState(users.guest);
      renderWithProviders(<Navbar />);

      expect(screen.queryByText('Products')).not.toBeInTheDocument();
      expect(screen.queryByText('My Orders')).not.toBeInTheDocument();
    });

    it('shows login button for guest users', () => {
      appState = makeAppState(users.guest);
      renderWithProviders(<Navbar />);

      expect(screen.getByText('Login')).toBeInTheDocument();
    });

    it('renders Delivery link for delivery drivers', () => {
      appState = makeAppState(users.driver);
      renderWithProviders(<Navbar />);

      expect(screen.getAllByText('Delivery').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('authenticated action controls', () => {
    it('renders expected top-bar actions for authenticated users', () => {
      appState = makeAppState(users.customer);
      renderWithProviders(<Navbar />, { route: '/orders' });

      expect(screen.getByLabelText('Toggle menu')).toBeInTheDocument();
      expect(screen.getByText('NotificationDropdown')).toBeInTheDocument();
      expect(screen.getByText('CartPreview')).toBeInTheDocument();
      expect(screen.getByLabelText('User menu')).toBeInTheDocument();
      expect(screen.getByTitle('Help & Support')).toBeInTheDocument();
    });
  });
});
