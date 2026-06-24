import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import ManageStoreSidebar from './ManageStoreSidebar';

function renderSidebar(path = '/manage-store/products') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/manage-store/*" element={<ManageStoreSidebar />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ManageStoreSidebar', () => {
  it('renders all four nav items', () => {
    renderSidebar();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Categories')).toBeTruthy();
    expect(screen.getByText('Media Library')).toBeTruthy();
    expect(screen.getByText('Bulk Management')).toBeTruthy();
  });

  it('marks the active nav item based on route', () => {
    renderSidebar('/manage-store/categories');
    const activeItem = screen.getByText('Categories').closest('a');
    expect(activeItem.className).toContain('active');
  });

  it('Products link is not active when on categories route', () => {
    renderSidebar('/manage-store/categories');
    const productsLink = screen.getByText('Products').closest('a');
    expect(productsLink.className).not.toContain('active');
  });
});
