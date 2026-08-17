import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

vi.mock('./components/DashboardHeader', () => ({
  default: () => <div>Dashboard Header</div>,
}));

vi.mock('./DashboardSidebar', () => ({
  default: () => <nav className="sidebar-container"><div className="sidebar-nav" /></nav>,
}));

const renderDashboard = (route = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />}>
          <Route index element={<div>Default content</div>} />
          <Route path="pending-registrations" element={<div>Pending Registrations</div>} />
          <Route path="messages" element={<div>Messages</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('DashboardPage layout shell', () => {
  it('renders the dashboard-layout wrapper with sidebar and main content', () => {
    const { container } = renderDashboard();

    const layout = container.querySelector('.dashboard-grid-layout');
    expect(layout).toBeInTheDocument();

    expect(layout?.querySelector('.sidebar-container')).toBeInTheDocument();
    expect(layout?.querySelector('.dashboard-grid-content')).toBeInTheDocument();
  });

  it('renders the page container', () => {
    const { container } = renderDashboard();
    expect(container.querySelector('.dashboard-grid-container')).toBeInTheDocument();
  });

  it('renders the DashboardHeader', () => {
    renderDashboard();
    expect(screen.getByText('Dashboard Header')).toBeInTheDocument();
  });

  it('renders child route content via Outlet', () => {
    renderDashboard('/dashboard/pending-registrations');
    expect(screen.getByText('Pending Registrations')).toBeInTheDocument();
  });

  it('renders different child route content when navigating', () => {
    renderDashboard('/dashboard/messages');
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });
});
