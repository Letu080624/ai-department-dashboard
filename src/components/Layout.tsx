/* Bố cục: SIDEBAR (thu gọn được; ngăn kéo trên mobile) + TOPBAR + MAIN */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MonitorPlay, Bell, BookOpen, Bot, ChevronsLeft, ChevronsRight, ClipboardCheck, FileBarChart2, FileCheck2, FlaskConical, GraduationCap, LayoutDashboard, ListChecks, LogOut, Menu, School, Settings, Sparkles, Target, Users, X } from 'lucide-react';
import { useApp } from '../lib/app';
import { cx, date, initials } from '../lib/format';
import { href, navigate } from '../lib/router';
import { uiStorage } from '../data/repository';
import { ROLE_LABEL } from '../services/authService';
import { LevelBadge } from './status';
import { DemoTour } from '../demo/DemoTour';
import { tour } from '../demo/tourStore';

/** 13 mục theo đúng thứ tự yêu cầu, chia nhóm để Trưởng Bộ môn định vị nhanh */
export const NAV_GROUPS = [
  { label: 'Điều hành', keys: ['overview'] },
  { label: 'Chuyên môn', keys: ['staff', 'training', 'courses', 'students', 'research'] },
  { label: 'Chất lượng & công việc', keys: ['kpi', 'qa', 'evidence', 'tasks'] },
  { label: 'Báo cáo & AI', keys: ['reports', 'ai'] },
  { label: 'Hệ thống', keys: ['admin'] },
] as const;
export const NAV = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'staff', label: 'Đội ngũ', icon: Users },
  { key: 'training', label: 'Đào tạo', icon: School },
  { key: 'courses', label: 'Học phần', icon: BookOpen },
  { key: 'students', label: 'Sinh viên/Học viên', icon: GraduationCap },
  { key: 'research', label: 'Nghiên cứu khoa học', icon: FlaskConical },
  { key: 'kpi', label: 'KPI', icon: Target },
  { key: 'qa', label: 'Bảo đảm chất lượng', icon: ClipboardCheck },
  { key: 'evidence', label: 'Minh chứng', icon: FileCheck2 },
  { key: 'tasks', label: 'Công việc', icon: ListChecks },
  { key: 'reports', label: 'Báo cáo', icon: FileBarChart2 },
  { key: 'ai', label: 'AI Assistant', icon: Bot },
  { key: 'admin', label: 'Quản trị', icon: Settings },
] as const;

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open, close]);
  return ref;
}

function SidebarNav({ active, collapsed, onNavigate }: { active: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="thin-scroll flex-1 overflow-y-auto px-2.5 py-3" aria-label="Điều hướng chính">
      {NAV_GROUPS.map((g, gi) => (
        <div key={g.label} className={cx(gi > 0 && 'mt-4')}>
          {collapsed ? (gi > 0 && <div className="mx-3 mb-3 border-t border-white/10" />) : <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-navy-200/70">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.keys.map(k => {
              const n = NAV.find(x => x.key === k)!; const Icon = n.icon, on = active === n.key;
              return (
                <li key={n.key}>
                  <a href={href(n.key)} onClick={onNavigate} title={collapsed ? n.label : undefined} aria-current={on ? 'page' : undefined}
                    className={cx('relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] leading-5 transition-colors', on ? 'bg-white/[0.12] font-semibold text-white' : 'text-navy-100/90 hover:bg-white/[0.07] hover:text-white', collapsed && 'justify-center px-0')}>
                    {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#f6c45b]" />}
                    <Icon className={cx('size-[18px] shrink-0', on ? 'text-white' : 'text-navy-200')} aria-hidden />
                    {!collapsed && <span className="truncate">{n.label}</span>}
                    {!collapsed && n.key === 'ai' && <Sparkles className="ml-auto size-3.5 text-[#f6c45b]" aria-hidden />}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { A } = useApp();
  return (
    <div className={cx('flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[13px] font-bold text-navy-700">BM</span>
      {!collapsed && <div className="min-w-0 leading-tight"><p className="truncate text-[13.5px] font-semibold text-white">Quản trị Bộ môn</p><p className="truncate text-[11.5px] text-navy-200">{A.department.code} · AI Copilot</p></div>}
    </div>
  );
}

export function Layout({ active, children }: { active: string; children: ReactNode }) {
  const { A, user, logout, login } = useApp();
  const [collapsed, setCollapsed] = useState(() => uiStorage.get<boolean>('sidebarCollapsed', false));
  const [mobile, setMobile] = useState(false);
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const bellRef = useOutside(bell, () => setBell(false));
  const menuRef = useOutside(menu, () => setMenu(false));
  const alerts = A.alerts();
  const toggle = () => { setCollapsed(c => { uiStorage.set('sidebarCollapsed', !c); return !c; }); };

  return (
    <div className="flex h-full">
      {/* Sidebar desktop */}
      <aside className={cx('hidden shrink-0 flex-col bg-navy-900 transition-[width] duration-200 lg:flex', collapsed ? 'w-[68px]' : 'w-[244px]')}>
        <Brand collapsed={collapsed} />
        <SidebarNav active={active} collapsed={collapsed} />
        <button type="button" onClick={toggle} className="flex h-11 items-center justify-center gap-2 border-t border-white/10 text-[12.5px] text-navy-200 hover:text-white" aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}>
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Thu gọn</>}
        </button>
      </aside>
      {/* Sidebar mobile (ngăn kéo) */}
      {mobile && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onMouseDown={e => { if (e.target === e.currentTarget) setMobile(false); }} style={{ background: 'rgb(15 23 42 / .45)' }}>
          <aside className="animate-in flex w-[264px] max-w-[85vw] flex-col bg-navy-900">
            <div className="flex items-center justify-between pr-2"><Brand collapsed={false} /><button type="button" aria-label="Đóng menu" onClick={() => setMobile(false)} className="rounded-md p-1.5 text-navy-100 hover:bg-white/10"><X className="size-5" /></button></div>
            <SidebarNav active={active} collapsed={false} onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-3 sm:px-6 lg:px-8">
          <button type="button" aria-label="Mở menu" onClick={() => setMobile(true)} className="rounded-md p-1.5 text-ink-2 hover:bg-navy-50 lg:hidden"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-navy-800">{A.department.name}</p>
            <p className="hidden truncate text-[12px] text-ink-2 sm:block">{A.get('units', A.department.parentId)?.name} · Dữ liệu đến {date(A.ref)}</p>
          </div>
          <div className="hidden items-center gap-1.5 md:flex">
            <span className="rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink-2">Năm học <b className="font-semibold text-ink">{A.currentYear.code}</b></span>
            <span className="rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink-2"><b className="font-semibold text-ink">{A.currentSemester.code}</b></span>
          </div>
          {/* Thông báo (cảnh báo theo quy tắc) */}
          <div className="relative" ref={bellRef}>
            <button type="button" onClick={() => setBell(b => !b)} aria-label={`Thông báo: ${alerts.length} cảnh báo`} aria-expanded={bell} className="relative rounded-lg p-2 text-ink-2 hover:bg-navy-50 hover:text-navy-700">
              <Bell className="size-5" />
              {alerts.length > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-white">{alerts.length}</span>}
            </button>
            {bell && (
              <div className="animate-in absolute right-0 top-11 z-40 w-[min(380px,calc(100vw-1.5rem))] rounded-xl border border-line bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><p className="text-[13.5px] font-semibold">Cảnh báo ({alerts.length})</p><span className="text-[11.5px] text-ink-3">Theo quy tắc hệ thống</span></div>
                <ul className="thin-scroll max-h-[60vh] overflow-y-auto">
                  {alerts.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-2">Không có cảnh báo.</li>}
                  {alerts.map(a => (
                    <li key={a.id}><a href={href(a.link)} onClick={() => setBell(false)} className="block border-b border-[#eef1f5] px-4 py-2.5 hover:bg-navy-50/60">
                      <div className="flex items-center gap-2"><LevelBadge l={a.level} /><span className="text-[11.5px] text-ink-3">{a.area}</span></div>
                      <p className="mt-1 text-[13px] font-medium text-ink">{a.title}</p>
                      <p className="line-clamp-2 text-[12px] text-ink-2">{a.detail}</p>
                    </a></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button type="button" onClick={() => navigate('ai')} className="hidden items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-navy-800 sm:inline-flex"><Bot className="size-4" />AI Assistant</button>
          {/* Người dùng */}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Tài khoản" className="flex items-center gap-2 rounded-lg p-1 hover:bg-navy-50">
              <span className="grid size-8 place-items-center rounded-full bg-navy-100 text-[12px] font-semibold text-navy-800">{initials(user.fullName)}</span>
              <span className="hidden text-left leading-tight xl:block"><span className="block max-w-36 truncate text-[13px] font-medium">{user.fullName}</span><span className="block text-[11.5px] text-ink-2">{ROLE_LABEL[user.role]}</span></span>
            </button>
            {menu && (
              <div className="animate-in absolute right-0 top-11 z-40 w-72 rounded-xl border border-line bg-white py-1 shadow-xl">
                <div className="border-b border-line px-4 py-2.5"><p className="text-[13.5px] font-semibold">{user.fullName}</p><p className="text-[12px] text-ink-2">{ROLE_LABEL[user.role]} · {user.email}</p><p className="mt-1 text-[11.5px] text-warn">Chế độ Demo — xác thực giả lập</p></div>
                <p className="px-4 pb-1 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-3">Đổi tài khoản demo</p>
                {A.d.users.filter(u => u.id !== user.id).map(u => (
                  <button key={u.id} type="button" onClick={() => { setMenu(false); login(u.id); }} className="flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-navy-50"><span className="truncate">{u.fullName}</span><span className="shrink-0 text-[11.5px] text-ink-2">{ROLE_LABEL[u.role]}</span></button>
                ))}
                <button type="button" onClick={() => { setMenu(false); tour.open(); }} className="mt-1 flex w-full items-center gap-2 border-t border-line px-4 py-2 text-left text-[13px] text-navy-700 hover:bg-navy-50"><MonitorPlay className="size-4" />Chế độ trình diễn (10 phút)</button>
                <button type="button" onClick={() => { setMenu(false); logout(); }} className="mt-1 flex w-full items-center gap-2 border-t border-line px-4 py-2 text-left text-[13px] text-bad hover:bg-bad-bg"><LogOut className="size-4" />Đăng xuất</button>
              </div>
            )}
          </div>
        </header>
        <main className="thin-scroll min-w-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
        <DemoTour />
      </div>
    </div>
  );
}
