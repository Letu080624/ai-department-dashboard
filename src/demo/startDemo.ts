/* Bắt đầu buổi trình diễn: khôi phục dữ liệu mẫu gốc, xoá cache AI/hội thoại, đăng nhập Trưởng Bộ môn, mở tour */
import { dataService } from '../services/dataService';
import { aiService } from '../services/aiService';
import { tour } from './tourStore';

export async function startDemo(login: (userId: string) => void) {
  await dataService.resetDemo();                 // xoá mọi thay đổi trên trình duyệt (dữ liệu, nhật ký, cache, hội thoại)
  aiService.clearCache();
  const head = dataService.analytics.d.users.find(u => u.role === 'HEAD') ?? dataService.analytics.d.users[0];
  tour.restore({ active: true, step: 0, startedAt: null, collapsed: false });
  login(head.id);
  window.location.hash = '/overview';
}
