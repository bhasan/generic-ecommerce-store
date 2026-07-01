import React, { useState, useEffect } from 'react';
import { Store } from 'lucide-react';
import BaseModal, { ModalHeader, ModalFooter } from '../../components/common/BaseModal';
import { getUserStoreRoles, setUserStoreRoles } from '../../services/usersApi';
import { getManagedStores } from '../../services/storesApi';
import { ROLES } from '../../utils/roles';

// Roles that are purely non-staff (never assigned to stores)
const NON_STAFF_ROLES = new Set([ROLES.CUSTOMER, ROLES.GUEST]);

// Fresh default state for a role: no "all stores", no individual stores checked.
// A factory (not a shared constant) so each role gets its own mutable Set.
const emptyRoleState = () => ({ allStores: false, checkedIds: new Set() });

/**
 * Modal for assigning which stores a staff user acts at, per role.
 *
 * Props:
 *   isOpen       - boolean
 *   onClose      - () => void
 *   user         - { id, username, roles: string[] }
 *   onSaved      - () => void   called after a successful save
 */
function StoreRoleAssignmentModal({ isOpen, onClose, user, onSaved }) {
  const [stores, setStores] = useState([]);
  // roleState: { [roleName]: { allStores: boolean, checkedIds: Set<number> } }
  const [roleState, setRoleState] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Derive the staff roles this user holds
  const staffRoles = (user?.roles ?? []).filter((r) => !NON_STAFF_ROLES.has(r));

  useEffect(() => {
    if (!isOpen || !user) return;

    setError('');
    setIsLoading(true);

    Promise.all([getManagedStores(), getUserStoreRoles(user.id)])
      .then(([storeList, assignmentData]) => {
        setStores(storeList ?? []);

        // Build initial roleState from loaded assignments
        const initial = {};
        const assignmentMap = {};
        for (const a of (assignmentData?.assignments ?? [])) {
          assignmentMap[a.roleName] = a.storeIds;
        }

        for (const roleName of staffRoles) {
          const loaded = assignmentMap[roleName];
          if (loaded === 'all') {
            initial[roleName] = { allStores: true, checkedIds: new Set() };
          } else if (Array.isArray(loaded)) {
            initial[roleName] = { allStores: false, checkedIds: new Set(loaded) };
          } else {
            // No existing assignment — default to no stores selected
            initial[roleName] = emptyRoleState();
          }
        }
        setRoleState(initial);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load assignments');
      })
      .finally(() => {
        setIsLoading(false);
      });
    // staffRoles is derived from user.roles; user itself is the dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  const handleAllStoresToggle = (roleName) => {
    setRoleState((prev) => ({
      ...prev,
      [roleName]: {
        ...prev[roleName],
        allStores: !prev[roleName]?.allStores,
        checkedIds: new Set(),
      },
    }));
  };

  const handleStoreToggle = (roleName, storeId) => {
    setRoleState((prev) => {
      const current = prev[roleName] ?? emptyRoleState();
      const nextIds = new Set(current.checkedIds);
      if (nextIds.has(storeId)) {
        nextIds.delete(storeId);
      } else {
        nextIds.add(storeId);
      }
      return { ...prev, [roleName]: { ...current, checkedIds: nextIds } };
    });
  };

  const handleSave = async () => {
    setError('');
    setIsSaving(true);

    try {
      const assignments = staffRoles.map((roleName) => {
        const state = roleState[roleName] ?? emptyRoleState();
        return {
          roleName,
          storeIds: state.allStores ? 'all' : [...state.checkedIds],
        };
      });

      await setUserStoreRoles(user.id, assignments);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Failed to save assignments');
    } finally {
      setIsSaving(false);
    }
  };

  // True when any staff role has allStores off AND zero stores checked — the backend
  // rejects an empty storeIds array with 400, so block the save at the UI layer.
  const hasInvalidRoleState = staffRoles.some((roleName) => {
    const state = roleState[roleName];
    if (!state) return false; // Still loading; isLoading already disables Save
    return !state.allStores && state.checkedIds.size === 0;
  });

  const titleId = 'store-role-assignment-title';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="560px"
      aria-labelledby={titleId}
    >
      <ModalHeader
        title={`Assign Stores — ${user?.username ?? ''}`}
        subtitle="Set which stores this user acts at for each of their staff roles."
        icon={<Store size={20} />}
        onClose={onClose}
      />

      <div className="modal-body" style={{ padding: '1rem 1.5rem' }}>
        {isLoading && <p>Loading...</p>}

        {!isLoading && staffRoles.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary, #6b7280)' }}>
            This user holds no staff roles. Assign a staff role first.
          </p>
        )}

        {!isLoading && error && (
          <div role="alert" style={{ color: 'var(--color-danger, #dc2626)', marginBottom: '0.75rem' }}>
            {error}
          </div>
        )}

        {!isLoading &&
          staffRoles.map((roleName) => {
            const state = roleState[roleName] ?? emptyRoleState();
            return (
              <div key={roleName} style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{roleName}</h4>

                {/* All stores toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={state.allStores}
                    onChange={() => handleAllStoresToggle(roleName)}
                  />
                  <span>All stores</span>
                </label>

                {/* Per-store checkboxes (disabled when allStores is on) */}
                <div style={{ paddingLeft: '1.25rem' }}>
                  {stores.map((store) => (
                    <label
                      key={store.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.25rem',
                        opacity: state.allStores ? 0.5 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={state.allStores || state.checkedIds.has(store.id)}
                        disabled={state.allStores}
                        onChange={() => handleStoreToggle(roleName, store.id)}
                      />
                      <span>{store.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      <ModalFooter>
        <button
          onClick={onClose}
          disabled={isSaving}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || isLoading || staffRoles.length === 0 || hasInvalidRoleState}
          className="btn btn-primary"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </ModalFooter>
    </BaseModal>
  );
}

export default StoreRoleAssignmentModal;
