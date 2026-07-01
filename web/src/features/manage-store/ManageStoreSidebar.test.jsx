import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManageStoreSidebar from './ManageStoreSidebar';
import * as AppContext from '../../context/AppContext';
import { ROLES } from '../../utils/roles';

vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(),
}));

function renderSidebar(path = '/manage-store/products', roles = [ROLES.MANAGEMENT]) {
  vi.mocked(AppContext.useApp).mockReturnValue({
    currentUser: { id: 1, username: 'testuser', roles },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/manage-store/*" element={<ManageStoreSidebar />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ManageStoreSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four base nav items for non-admin users', () => {
    renderSidebar('/manage-store/products', [ROLES.MANAGEMENT]);
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Categories')).toBeTruthy();
    expect(screen.getByText('Media Library')).toBeTruthy();
    expect(screen.getByText('Bulk Management')).toBeTruthy();
    // Store Inventory is admin-only — should NOT appear
    expect(screen.queryByText('Store Inventory')).toBeNull();
  });

  it('renders Store Inventory nav item for admin users', () => {
    renderSidebar('/manage-store/products', [ROLES.ADMIN]);
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Store Inventory')).toBeTruthy();
  });

  it('marks the active nav item based on route', () => {
    renderSidebar('/manage-store/categories', [ROLES.MANAGEMENT]);
    const activeItem = screen.getByText('Categories').closest('a');
    expect(activeItem.className).toContain('active');
  });

  it('Products link is not active when on categories route', () => {
    renderSidebar('/manage-store/categories', [ROLES.MANAGEMENT]);
    const productsLink = screen.getByText('Products').closest('a');
    expect(productsLink.className).not.toContain('active');
  });
});
