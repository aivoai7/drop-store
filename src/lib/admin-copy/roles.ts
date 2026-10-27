import type { Role } from "@/lib/permissions";

export const ROLE_LABELS_ZH: Record<Role, string> = {
  owner: "店主",
  manager: "店长",
  viewer: "只读",
};

export const ROLE_HELP_ZH: Record<Role, string> = {
  owner: "全部权限，包括团队与角色管理",
  manager: "商品、订单、客户、折扣等日常运营",
  viewer: "仅可查看后台，不能修改",
};
