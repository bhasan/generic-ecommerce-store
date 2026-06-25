import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboardTabs from './AdminDashboardTabs';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const SECTIONS = [
  { label: /pending registrations/i, key: 'pending-registrations' },
  { label: /announcements/i, key: 'announcements' },
  { label: /messages/i, key: 'messages' },
  { label: /vip management/i, key: 'vip-management' },
  { label: /landing page/i, key: 'landing-page' },
  { label: /^users$/i, key: 'users' },
  { label: /rejected users/i, key: 'rejected-users' },
];

const renderSidebar = (props = {}) =>
  render(
    <MemoryRouter>
      <AdminDashboardTabs
        currentTab="dashboard"
        activeSection="pending-registrations"
        onSectionChange={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );

describe('AdminDashboardTabs sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an aside element with the dashboard-sidebar class', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside.dashboard-sidebar');
    expect(aside).toBeInTheDocument();
  });

  it('renders a nav element inside the sidebar', () => {
    const { container } = renderSidebar();
    const nav = container.querySelector('aside.dashboard-sidebar nav.sidebar-nav');
    expect(nav).toBeInTheDocument();
  });

  it('renders all 7 section items', () => {
    renderSidebar();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);
  });

  it.each(SECTIONS)('renders a "$key" nav item', ({ label }) => {
    renderSidebar();
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('applies sidebar-nav-item class to all buttons', () => {
    const { container } = renderSidebar();
    const buttons = container.querySelectorAll('button.sidebar-nav-item');
    expect(buttons).toHaveLength(7);
  });

  it.each([
    /payment settings/i,
    /store settings/i,
    /ordering constraints/i,
  ])('does not render removed tab "%s"', (label) => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
  });

  it('applies the active class to the button matching activeSection', () => {
    renderSidebar({ activeSection: 'messages' });
    const activeBtn = screen.getByRole('button', { name: /messages/i });
    expect(activeBtn).toHaveClass('active');
  });

  it('does not apply active to non-active buttons', () => {
    renderSidebar({ activeSection: 'messages' });
    const inactiveBtn = screen.getByRole('button', { name: /announcements/i });
    expect(inactiveBtn).not.toHaveClass('active');
  });

  it('does not mark any item active when currentTab is not "dashboard"', () => {
    renderSidebar({ currentTab: 'other', activeSection: 'messages' });
    const { container } = render(
      <MemoryRouter>
        <AdminDashboardTabs currentTab="other" activeSection="messages" onSectionChange={vi.fn()} />
      </MemoryRouter>
    );
    const activeButtons = container.querySelectorAll('button.sidebar-nav-item.active');
    expect(activeButtons).toHaveLength(0);
  });

  it.each(SECTIONS)('clicking "$key" calls navigate with the correct URL', ({ label, key }) => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(mockNavigate).toHaveBeenCalledWith(`/dashboard?section=${key}`);
  });

  it.each(SECTIONS)('clicking "$key" calls onSectionChange with the section key', ({ label, key }) => {
    const onSectionChange = vi.fn();
    renderSidebar({ onSectionChange });
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onSectionChange).toHaveBeenCalledWith(key);
  });

  it('does not throw when onSectionChange is not provided', () => {
    renderSidebar({ onSectionChange: undefined });
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /messages/i }))
    ).not.toThrow();
  });
});
