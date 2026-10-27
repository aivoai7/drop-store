export const ROLES = ["owner", "manager", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { viewer: 1, manager: 2, owner: 3 };

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canEdit(role: string) {
  return isRole(role) && RANK[role] >= RANK.manager;
}

export function canManageAdmins(role: string) {
  return isRole(role) && RANK[role] >= RANK.owner;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  viewer: "Viewer",
};

export const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including team and roles",
  manager: "Products, orders, customers, discounts",
  viewer: "Read-only access to the admin",
};
