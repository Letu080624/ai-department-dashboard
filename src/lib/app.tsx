/* =========================================================================
 * App context: trạng thái dữ liệu (dataService) + người dùng hiện tại (authService) + phân quyền.
 * Component đọc dữ liệu qua useApp().A (Analytics do dataService cung cấp), không đọc repository.
 * ========================================================================= */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Analytics } from '../domain/analytics';
import type { User } from '../types/domain';
import { authService, can as canFn, canOnOwn as canOwnFn, type Permission } from '../services/authService';
import { dataService } from '../services/dataService';

interface AppCtx {
  A: Analytics; version: number; user: User;
  can: (p: Permission) => boolean; canOnOwn: (p: Permission, ownerLecturerId: string | null) => boolean;
  login: (userId: string) => void; logout: () => void;
}
const Ctx = createContext<AppCtx | null>(null);

export function useDataState() { return useSyncExternalStore(dataService.subscribe, dataService.getState); }

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp phải dùng bên trong <AppProvider>');
  return c;
}

/** Chỉ render children khi dữ liệu sẵn sàng và đã đăng nhập; ngược lại render `fallback` */
export function AppProvider({ children, loginPage, loading, error }: { children: ReactNode; loginPage: (login: (id: string) => void) => ReactNode; loading: ReactNode; error: (msg: string, retry: () => void) => ReactNode }) {
  const st = useDataState();
  const [userId, setUserId] = useState<string | null>(() => authService.currentUserId());
  useEffect(() => { if (st.status === 'loading' && !st.analytics) void dataService.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const user = useMemo(() => (st.analytics && userId ? st.analytics.d.users.find(u => u.id === userId) ?? null : null), [st.analytics, userId]);
  useEffect(() => { dataService.setUser(user); }, [user]);

  const login = useCallback((id: string) => {
    authService.login(id); setUserId(id);
    const u = dataService.getState().analytics?.d.users.find(x => x.id === id) ?? null;
    dataService.setUser(u); void dataService.audit('login', 'users', id, null, { role: u?.role, mode: 'demo' });
  }, []);
  const logout = useCallback(() => { void dataService.audit('logout', 'users', userId); authService.logout(); dataService.setUser(null); setUserId(null); window.location.hash = '/overview'; }, [userId]);

  const value = useMemo<AppCtx | null>(() => (st.analytics && user ? {
    A: st.analytics, version: st.version, user,
    can: p => canFn(user, p), canOnOwn: (p, o) => canOwnFn(user, p, o), login, logout,
  } : null), [st.analytics, st.version, user, login, logout]);

  if (st.status === 'error') return <>{error(st.error ?? 'Lỗi không xác định', () => void dataService.load())}</>;
  if (!st.analytics) return <>{loading}</>;
  if (!value) return <>{loginPage(login)}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
