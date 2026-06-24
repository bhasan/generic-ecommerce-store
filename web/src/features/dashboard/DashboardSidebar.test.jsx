import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import DashboardSidebar from './DashboardSidebar';

const NAV_ITEMS = [
  { label: /pending registrations/i, href: '/dashboard/pending-registrations' },
  { label: /announcements/i, href: '/dashboard/announcements' },
  { label: /messages/i, href: '/dashboard/messages' },
  { label: /vip management/i, href: '/dashboard/vip-management' },
  { label: /landing page/i, href: '/dashboard/landing-page' },
  { label: /^users$/i, href: '/dashboard/users' },
  { label: /rejected users/i, href: '/dashboard/rejected-users' },
];

const renderSidebar = (route = '/dashboard/pending-registrations') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <DashboardSidebar />
    </MemoryRouter>
  );

describe('DashboardSidebar', () => {
  it('renders an aside with dashboard-sidebar class', () => {
    const { container } = renderSidebar();
    expect(container.querySelector('aside.dashboard-sidebar')).toBeInTheDocument();
  });

  it('renders a sidebar-nav inside the aside', () => {
    const { container } = renderSidebar();
    expect(container.querySelector('aside.dashboard-sidebar nav.sidebar-nav')).toBeInTheDocument();
  });

  it('renders all 7 nav items as links', () => {
    renderSidebar();
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });

  it.each(NAV_ITEMS)('renders a "$href" nav link', ({ label }) => {
    renderSidebar();
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it('applies sidebar-nav-item class to all links', () => {
    const { container } = renderSidebar();
    const links = container.querySelectorAll('a.sidebar-nav-item');
    expect(links).toHaveLength(7);
  });

  it('marks the active link based on the current route', () => {
    renderSidebar('/dashboard/messages');
    const activeLink = screen.getByRole('link', { name: /messages/i });
    expect(activeLink).toHaveClass('active');
  });

  it('does not mark non-active links as active', () => {
    renderSidebar('/dashboard/messages');
    const inactiveLink = screen.getByRole('link', { name: /announcements/i });
    expect(inactiveLink).not.toHaveClass('active');
  });

  it.each(NAV_ITEMS)('$href link points to the correct route', ({ label, href }) => {
    renderSidebar();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });
});
