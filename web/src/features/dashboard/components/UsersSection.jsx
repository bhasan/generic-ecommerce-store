import React from 'react';
import { Users, Clock, Mail, Check, X, User, Calendar, Edit, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

function SortIcon({ field, sortField, sortDirection }) {
  if (sortField !== field) {
    return <ChevronUp size={14} className="sort-icon sort-icon-inactive" />;
  }
  return sortDirection === 'asc'
    ? <ChevronUp size={14} className="sort-icon sort-icon-active" />
    : <ChevronDown size={14} className="sort-icon sort-icon-active" />;
}

function UsersSection({
  isLoading,
  users,
  sortedUsers,
  sortField,
  sortDirection,
  onSort,
  currentUserId,
  availableRoles,
  editingUserId,
  editingRoles,
  onToggleRole,
  onSaveRoles,
  onCancelEdit,
  onEditRoles,
  onDeleteUser,
  formatDateShort,
  getRoleBadgeClass
}) {
  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header">
        <h3 className="section-title">
          <Users size={24} />
          Users Management
        </h3>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <Users size={64} className="empty-icon" />
          <p>No users found.</p>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th
                  className="sortable-header"
                  onClick={() => onSort('id')}
                >
                  <div className="header-content">
                    <span>ID</span>
                    <SortIcon field="id" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="sortable-header"
                  onClick={() => onSort('name')}
                >
                  <div className="header-content">
                    <span>Username</span>
                    <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="sortable-header"
                  onClick={() => onSort('email')}
                >
                  <div className="header-content">
                    <span>Email</span>
                    <SortIcon field="email" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th>Status</th>
                <th
                  className="sortable-header"
                  onClick={() => onSort('roles')}
                >
                  <div className="header-content">
                    <span>Roles</span>
                    <SortIcon field="roles" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="sortable-header"
                  onClick={() => onSort('createdAt')}
                >
                  <div className="header-content">
                    <span>Created</span>
                    <SortIcon field="createdAt" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id}>
                  <td>#{user.id}</td>
                  <td>
                    <div className="user-name-cell">
                      <User size={16} />
                      <span>{user.username}</span>
                    </div>
                  </td>
                  <td>
                    <div className="user-email-cell">
                      <Mail size={16} />
                      <span>{user.email}</span>
                    </div>
                  </td>
                  <td>
                    {user.approved ? (
                      <span className="status-badge status-approved">
                        <Check size={14} />
                        Approved
                      </span>
                    ) : user.rejected ? (
                      <span className="status-badge status-rejected">
                        <X size={14} />
                        Rejected
                      </span>
                    ) : (
                      <span className="status-badge status-pending">
                        <Clock size={14} />
                        Pending
                      </span>
                    )}
                  </td>
                  <td>
                    {editingUserId === user.id ? (
                      <div className="role-editor">
                        <div className="role-checkboxes">
                          {availableRoles.map(role => (
                            <label key={role} className="role-checkbox-label">
                              <input
                                type="checkbox"
                                checked={editingRoles.includes(role)}
                                onChange={() => onToggleRole(role)}
                              />
                              <span className={getRoleBadgeClass(role)}>{role}</span>
                            </label>
                          ))}
                        </div>
                        <div className="role-editor-actions">
                          <button
                            onClick={() => onSaveRoles(user.id)}
                            className="btn-save-roles"
                            title="Save roles"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={onCancelEdit}
                            className="btn-cancel-roles"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="user-roles-cell">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.map((role, idx) => (
                            <span key={idx} className={getRoleBadgeClass(role)}>
                              {role}
                            </span>
                          ))
                        ) : user.role ? (
                          <span className={getRoleBadgeClass(user.role)}>
                            {user.role}
                          </span>
                        ) : (
                          <span className="role-badge role-badge-no-roles" title="No roles - appears in Pending Registrations">
                            No Roles
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="user-date-cell">
                      <Calendar size={16} />
                      <span>{formatDateShort(user.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="user-actions-cell">
                      {editingUserId !== user.id && (
                        <>
                          <button
                            onClick={() => onEditRoles(user)}
                            className="btn-edit-roles"
                            title="Edit roles"
                          >
                            <Edit size={16} />
                          </button>
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => onDeleteUser(user.id, user.username)}
                              className="btn-delete-user"
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          {user.id === currentUserId && (
                            <span className="current-user-badge">You</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default UsersSection;
