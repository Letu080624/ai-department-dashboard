/* =========================================================================
 * Authentication (MOCK) + Authorization layer.
 * - Demo: chọn tài khoản demo (mặc định HEAD), không có mật khẩu — CHỈ dùng trình diễn.
 * - Authorization tách riêng (can(role, permission)) để khi thay bằng SSO/JWT thật
 *   chỉ cần đổi nguồn "user hiện tại"; mọi kiểm tra quyền trong UI giữ nguyên.
 * - Production: quyết định quyền phải kiểm lại ở API (UI chỉ ẩn/hiện chức năng).
 * ========================================================================= */
import type { Role, User } from '../types/domain';
import { uiStorage } from '../data/repository';

export type Permission =
  | 'dashboard.view' | 'staff.detail' | 'kpi.entry' | 'kpi.define' | 'task.update' | 'evidence.update' | 'evidence.verify'
  | 'qa.update' | 'improvement.approve' | 'ai.use' | 'report.generate' | 'admin.settings' | 'admin.frameworks' | 'audit.view';

/** Ma trận quyền (cấu hình) — khớp kế hoạch Production (RBAC) */
export const PERMISSIONS: Record<Permission, Role[]> = {
  'dashboard.view': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'LECTURER', 'QA', 'VIEWER'],
  'staff.detail': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA'],
  'kpi.entry': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA'],
  'kpi.define': ['ADMIN', 'HEAD'],
  'task.update': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA', 'LECTURER'],
  'evidence.update': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA', 'LECTURER'],
  'evidence.verify': ['QA'],
  'qa.update': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA'],
  'improvement.approve': ['HEAD', 'DEPUTY_HEAD', 'QA'],
  'ai.use': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA', 'LECTURER'],
  'report.generate': ['ADMIN', 'HEAD', 'DEPUTY_HEAD', 'QA'],
  'admin.settings': ['ADMIN', 'HEAD'],
  'admin.frameworks': ['ADMIN', 'QA'],
  'audit.view': ['ADMIN', 'HEAD'],
};
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Quản trị hệ thống', HEAD: 'Trưởng Bộ môn', DEPUTY_HEAD: 'Phó Trưởng Bộ môn', LECTURER: 'Giảng viên', QA: 'Bảo đảm chất lượng', VIEWER: 'Chỉ xem' };

export const can = (user: User | null, p: Permission) => !!user && PERMISSIONS[p].includes(user.role);
/** Giảng viên chỉ được sửa bản ghi của chính mình (công việc, minh chứng) */
export const canOnOwn = (user: User | null, p: Permission, ownerLecturerId: string | null) =>
  can(user, p) && (user!.role !== 'LECTURER' || (!!ownerLecturerId && user!.lecturerId === ownerLecturerId));

export const authService = {
  /** Phiên demo lưu trong trình duyệt; Production: cookie phiên do server cấp sau SSO */
  currentUserId(): string | null { return uiStorage.get<string>('session', '') || null; },
  login(userId: string) { uiStorage.set('session', userId); },
  logout() { uiStorage.set('session', ''); },
};
