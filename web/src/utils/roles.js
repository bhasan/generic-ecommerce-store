export const getUserRoles = (user) => {
  if (!user) return [];
  if (Array.isArray(user.roles)) return user.roles;
  if (user.role) return [user.role];
  return [];
};

export const hasRole = (user, role) => {
  const roles = getUserRoles(user);
  return roles.includes(role);
};

export const hasAnyRole = (user, roles) => {
  const userRoles = getUserRoles(user);
  return roles.some((role) => userRoles.includes(role));
};
