import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreRoleAssignmentModal from './StoreRoleAssignmentModal';

// ── API mocks ──────────────────────────────────────────────────────────────────
vi.mock('../../services/usersApi', () => ({
  getUserStoreRoles: vi.fn(),
  setUserStoreRoles: vi.fn(),
}));

vi.mock('../../services/storesApi', () => ({
  getManagedStores: vi.fn(),
}));

import * as usersApi from '../../services/usersApi';
import * as storesApi from '../../services/storesApi';

const STORES = [
  { id: 10, name: 'Store Alpha', slug: 'alpha', isDefault: true, status: 'ACTIVE' },
  { id: 20, name: 'Store Beta', slug: 'beta', isDefault: false, status: 'ACTIVE' },
];

const STAFF_USER = {
  id: 42,
  username: 'staff-alice',
  roles: ['EMPLOYEE', 'MANAGEMENT'],
};

const CUSTOMER_USER = {
  id: 99,
  username: 'customer-bob',
  roles: ['CUSTOMER'],
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const renderModal = (props = {}) => {
  const defaults = {
    isOpen: true,
    onClose: vi.fn(),
    user: STAFF_USER,
    onSaved: vi.fn(),
    ...props,
  };
  return render(<StoreRoleAssignmentModal {...defaults} />);
};

describe('StoreRoleAssignmentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.getManagedStores).mockResolvedValue(STORES);
    vi.mocked(usersApi.getUserStoreRoles).mockResolvedValue({
      userId: STAFF_USER.id,
      assignments: [
        { roleName: 'EMPLOYEE', storeIds: [10, 20] },
        { roleName: 'MANAGEMENT', storeIds: 'all' },
      ],
    });
    vi.mocked(usersApi.setUserStoreRoles).mockResolvedValue({
      userId: STAFF_USER.id,
      assignments: [],
    });
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <StoreRoleAssignmentModal
        isOpen={false}
        onClose={vi.fn()}
        user={STAFF_USER}
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('loads current assignments and stores on open', async () => {
    renderModal();

    await waitFor(() => {
      expect(storesApi.getManagedStores).toHaveBeenCalled();
      expect(usersApi.getUserStoreRoles).toHaveBeenCalledWith(STAFF_USER.id);
    });

    // Both staff roles are rendered
    expect(await screen.findByText('EMPLOYEE')).toBeInTheDocument();
    expect(screen.getByText('MANAGEMENT')).toBeInTheDocument();

    // Store names appear
    expect(screen.getAllByText('Store Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Store Beta').length).toBeGreaterThan(0);
  });

  it('prefills loaded assignments — EMPLOYEE at [10,20] → those stores checked', async () => {
    renderModal();
    await screen.findByText('EMPLOYEE');

    // For EMPLOYEE, Store Alpha (id:10) and Store Beta (id:20) should be checked.
    // There are two roles rendered; get all checkboxes in the EMPLOYEE section.
    // The "All stores" checkbox for EMPLOYEE should NOT be checked.
    const allCheckboxes = screen.getAllByRole('checkbox');
    // The modal renders in order: EMPLOYEE [All stores, Alpha, Beta], MANAGEMENT [All stores, Alpha, Beta]
    // EMPLOYEE All stores = index 0 (unchecked for EMPLOYEE since storeIds=[10,20])
    // EMPLOYEE Store Alpha = index 1 (checked)
    // EMPLOYEE Store Beta = index 2 (checked)
    // MANAGEMENT All stores = index 3 (checked, since 'all')
    expect(allCheckboxes[0].checked).toBe(false); // EMPLOYEE: all stores off
    expect(allCheckboxes[1].checked).toBe(true);  // EMPLOYEE: Store Alpha on
    expect(allCheckboxes[2].checked).toBe(true);  // EMPLOYEE: Store Beta on
    expect(allCheckboxes[3].checked).toBe(true);  // MANAGEMENT: all stores on
  });

  it('checking stores for a role and saving calls setUserStoreRoles with correct payload', async () => {
    // Start with empty assignments
    vi.mocked(usersApi.getUserStoreRoles).mockResolvedValue({
      userId: STAFF_USER.id,
      assignments: [],
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSaved, onClose });

    await screen.findByText('EMPLOYEE');

    // Find all checkboxes; first group is EMPLOYEE: [All stores, Alpha, Beta]
    // second group is MANAGEMENT: [All stores, Alpha, Beta]
    const allCheckboxes = screen.getAllByRole('checkbox');
    // Check Store Alpha for EMPLOYEE (index 1)
    fireEvent.click(allCheckboxes[1]);
    // Enable "All stores" for MANAGEMENT (index 3) so Save is not blocked by guard
    fireEvent.click(allCheckboxes[3]);

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(usersApi.setUserStoreRoles).toHaveBeenCalledWith(
        STAFF_USER.id,
        expect.arrayContaining([
          expect.objectContaining({ roleName: 'EMPLOYEE', storeIds: [10] }),
        ]),
      );
    });

    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('toggling "All stores" for a role sends storeIds:"all"', async () => {
    vi.mocked(usersApi.getUserStoreRoles).mockResolvedValue({
      userId: STAFF_USER.id,
      assignments: [],
    });
    const onSaved = vi.fn();
    renderModal({ onSaved });

    await screen.findByText('EMPLOYEE');

    const allCheckboxes = screen.getAllByRole('checkbox');
    // Toggle "All stores" for EMPLOYEE (index 0)
    fireEvent.click(allCheckboxes[0]);
    // Enable "All stores" for MANAGEMENT (index 3) so Save is not blocked by guard
    fireEvent.click(allCheckboxes[3]);

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(usersApi.setUserStoreRoles).toHaveBeenCalledWith(
        STAFF_USER.id,
        expect.arrayContaining([
          expect.objectContaining({ roleName: 'EMPLOYEE', storeIds: 'all' }),
        ]),
      );
    });
  });

  it('surfaces API error in a role="alert" element when save fails', async () => {
    vi.mocked(usersApi.setUserStoreRoles).mockRejectedValue(new Error('Server error'));
    // Use default beforeEach assignments (EMPLOYEE=[10,20], MANAGEMENT='all') so Save is enabled

    renderModal();
    await screen.findByText('EMPLOYEE');

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });

  it('disables Save when any staff role has allStores off and no stores checked', async () => {
    // Empty assignments → both roles in invalid state (no stores, allStores off)
    vi.mocked(usersApi.getUserStoreRoles).mockResolvedValue({
      userId: STAFF_USER.id,
      assignments: [],
    });

    renderModal();
    await screen.findByText('EMPLOYEE');

    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
  });

  it('shows "no staff roles" message for a customer-only user', async () => {
    vi.mocked(usersApi.getUserStoreRoles).mockResolvedValue({
      userId: CUSTOMER_USER.id,
      assignments: [],
    });

    renderModal({ user: CUSTOMER_USER });

    expect(await screen.findByText(/no staff roles/i)).toBeInTheDocument();
  });
});
