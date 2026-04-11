import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VIPManagementSection from './VIPManagementSection';

// Fixtures
const alice   = { id: 1, username: 'alice',   roles: ['CUSTOMER'] };
const bob     = { id: 2, username: 'bob',     roles: ['CUSTOMER', 'VIP'] };
const charlie = { id: 3, username: 'charlie', roles: ['CUSTOMER'] };
const adminUser = { id: 9, username: 'admin', roles: ['ADMIN'] }; // no CUSTOMER role

const blueDream  = { id: 101, name: 'Blue Dream',  vipOnly: false };
const vipSpecial = { id: 102, name: 'VIP Special', vipOnly: true };

const defaultProps = {
  isLoading: false,
  users: [alice, bob, charlie, adminUser],
  products: [blueDream, vipSpecial],
  onToggleVipUser: vi.fn(),
  onToggleVipProduct: vi.fn(),
};

describe('VIPManagementSection', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Loading state ─────────────────────────────────────────────────────────

  it('shows a loading spinner when isLoading is true', () => {
    render(<VIPManagementSection {...defaultProps} isLoading />);
    expect(screen.getByText(/loading vip data/i)).toBeInTheDocument();
  });

  it('does not render the panels while loading', () => {
    render(<VIPManagementSection {...defaultProps} isLoading />);
    expect(screen.queryByText(/vip customers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vip products/i)).not.toBeInTheDocument();
  });

  // ── Panel headers ─────────────────────────────────────────────────────────

  it('renders both panel headers', () => {
    render(<VIPManagementSection {...defaultProps} />);
    expect(screen.getByText('VIP Customers')).toBeInTheDocument();
    expect(screen.getByText('VIP Products')).toBeInTheDocument();
  });

  it('shows correct VIP customer count in the header', () => {
    render(<VIPManagementSection {...defaultProps} />);
    // 1 VIP (bob) out of 3 customers (adminUser excluded)
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('shows correct VIP product count in the header', () => {
    render(<VIPManagementSection {...defaultProps} />);
    // 1 vipOnly out of 2 products
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  // ── Customer filtering ────────────────────────────────────────────────────

  it('only renders users with the CUSTOMER role', () => {
    render(<VIPManagementSection {...defaultProps} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('charlie')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  // ── VIP badges ────────────────────────────────────────────────────────────

  it('shows a VIP badge next to VIP users', () => {
    render(<VIPManagementSection {...defaultProps} />);
    // bob is VIP — the badge text is "VIP"
    const badges = screen.getAllByText('VIP');
    // At least one badge in the customer list (not counting the header title)
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show a VIP badge for non-VIP customers', () => {
    // Use non-vipOnly products so the product panel adds no .vip-badge either
    render(<VIPManagementSection {...defaultProps} users={[alice]} products={[blueDream]} />);
    // alice has no VIP role — no badge should appear in the list
    // The section header "VIP Customers" contains "VIP" but there should be no badge span
    const listItems = document.querySelectorAll('.vip-list-item');
    expect(listItems).toHaveLength(2); // 1 customer + 1 product
    const customerItem = listItems[0];
    expect(customerItem.querySelector('.vip-badge')).toBeNull();
  });

  it('shows a VIP Only badge on vipOnly products', () => {
    render(<VIPManagementSection {...defaultProps} />);
    expect(screen.getByText('VIP Only')).toBeInTheDocument();
  });

  it('does not show a VIP Only badge on regular products', () => {
    render(<VIPManagementSection {...defaultProps} products={[blueDream]} />);
    expect(screen.queryByText('VIP Only')).not.toBeInTheDocument();
  });

  // ── Toggle buttons ────────────────────────────────────────────────────────

  it('shows "Grant VIP" button for non-VIP customers', () => {
    render(<VIPManagementSection {...defaultProps} users={[alice]} />);
    expect(screen.getByRole('button', { name: /grant vip/i })).toBeInTheDocument();
  });

  it('shows "Remove" button for VIP customers', () => {
    // Use non-vipOnly products so only the customer panel has a Remove button
    render(<VIPManagementSection {...defaultProps} users={[bob]} products={[blueDream]} />);
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onToggleVipUser with the correct user when Grant VIP is clicked', async () => {
    const onToggleVipUser = vi.fn().mockResolvedValue(undefined);
    render(<VIPManagementSection {...defaultProps} users={[alice]} onToggleVipUser={onToggleVipUser} />);
    fireEvent.click(screen.getByRole('button', { name: /grant vip/i }));
    await waitFor(() => expect(onToggleVipUser).toHaveBeenCalledWith(alice));
  });

  it('calls onToggleVipUser with the VIP user when Remove is clicked', async () => {
    const onToggleVipUser = vi.fn().mockResolvedValue(undefined);
    // Use only non-VIP products so the product panel has no Remove button
    render(<VIPManagementSection {...defaultProps} users={[bob]} products={[blueDream]} onToggleVipUser={onToggleVipUser} />);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(onToggleVipUser).toHaveBeenCalledWith(bob));
  });

  it('shows "Make VIP" button for non-VIP products', () => {
    render(<VIPManagementSection {...defaultProps} products={[blueDream]} />);
    expect(screen.getByRole('button', { name: /make vip/i })).toBeInTheDocument();
  });

  it('calls onToggleVipProduct with the correct product when Make VIP is clicked', async () => {
    const onToggleVipProduct = vi.fn().mockResolvedValue(undefined);
    render(<VIPManagementSection {...defaultProps} products={[blueDream]} onToggleVipProduct={onToggleVipProduct} />);
    fireEvent.click(screen.getByRole('button', { name: /make vip/i }));
    await waitFor(() => expect(onToggleVipProduct).toHaveBeenCalledWith(blueDream));
  });

  it('calls onToggleVipProduct with the VIP product when Remove is clicked', async () => {
    const onToggleVipProduct = vi.fn().mockResolvedValue(undefined);
    // Use only non-VIP users so the customer panel has no Remove button
    render(<VIPManagementSection {...defaultProps} users={[alice]} products={[vipSpecial]} onToggleVipProduct={onToggleVipProduct} />);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(onToggleVipProduct).toHaveBeenCalledWith(vipSpecial));
  });

  // ── Saving state ─────────────────────────────────────────────────────────

  it('disables the toggle button and shows a spinner while saving a user', async () => {
    let resolve;
    const onToggleVipUser = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<VIPManagementSection {...defaultProps} users={[alice]} onToggleVipUser={onToggleVipUser} />);

    const btn = screen.getByRole('button', { name: /grant vip/i });
    fireEvent.click(btn);

    // Button should be disabled while the promise is pending
    await waitFor(() => expect(btn).toBeDisabled());
    resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('disables the toggle button and shows a spinner while saving a product', async () => {
    let resolve;
    const onToggleVipProduct = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<VIPManagementSection {...defaultProps} products={[blueDream]} onToggleVipProduct={onToggleVipProduct} />);

    const btn = screen.getByRole('button', { name: /make vip/i });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  // ── Empty states ─────────────────────────────────────────────────────────

  it('shows an empty state when there are no customers', () => {
    render(<VIPManagementSection {...defaultProps} users={[adminUser]} />);
    expect(screen.getByText(/no approved customers found/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no products', () => {
    render(<VIPManagementSection {...defaultProps} products={[]} />);
    expect(screen.getByText(/no products found/i)).toBeInTheDocument();
  });

  // ── Search filtering ─────────────────────────────────────────────────────

  it('filters customers by username after the debounce delay', async () => {
    vi.useFakeTimers();
    render(<VIPManagementSection {...defaultProps} />);

    const [customerInput] = screen.getAllByPlaceholderText(/search/i);
    fireEvent.change(customerInput, { target: { value: 'ali' } });

    // Before debounce fires: all customers still visible
    expect(screen.getByText('bob')).toBeInTheDocument();

    // Advance past the 200ms debounce
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
    expect(screen.queryByText('charlie')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('filters products by name after the debounce delay', async () => {
    vi.useFakeTimers();
    render(<VIPManagementSection {...defaultProps} />);

    const [, productInput] = screen.getAllByPlaceholderText(/search/i);
    fireEvent.change(productInput, { target: { value: 'vip' } });

    await act(async () => { vi.advanceTimersByTime(200); });

    expect(screen.getByText('VIP Special')).toBeInTheDocument();
    expect(screen.queryByText('Blue Dream')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('shows a no-match message when the customer search has no results', async () => {
    vi.useFakeTimers();
    render(<VIPManagementSection {...defaultProps} />);

    const [customerInput] = screen.getAllByPlaceholderText(/search/i);
    fireEvent.change(customerInput, { target: { value: 'zzz' } });

    await act(async () => { vi.advanceTimersByTime(200); });

    expect(screen.getByText(/no customers match/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('shows a no-match message when the product search has no results', async () => {
    vi.useFakeTimers();
    render(<VIPManagementSection {...defaultProps} />);

    const [, productInput] = screen.getAllByPlaceholderText(/search/i);
    fireEvent.change(productInput, { target: { value: 'zzz' } });

    await act(async () => { vi.advanceTimersByTime(200); });

    expect(screen.getByText(/no products match/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('does not filter before the debounce delay elapses', async () => {
    vi.useFakeTimers();
    render(<VIPManagementSection {...defaultProps} />);

    const [customerInput] = screen.getAllByPlaceholderText(/search/i);
    fireEvent.change(customerInput, { target: { value: 'ali' } });

    // Only 100ms — debounce not yet fired
    await act(async () => { vi.advanceTimersByTime(100); });

    // All three customers should still be visible
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('charlie')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
