/* =========================================================================
 * App: AppProvider (dữ liệu + đăng nhập) → Layout → trang theo hash route.
 * Trang được tải lười (code splitting) để trang Tổng quan mở nhanh.
 * ========================================================================= */
import { lazy, Suspense } from 'react';
import { AppProvider } from './lib/app';
import { useRoute } from './lib/router';
import { Layout, NAV } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorState, Loading, PageSkeleton, Toaster } from './components/ui';
import Login from './pages/Login';

const pages = {
  overview: lazy(() => import('./pages/Overview')),
  staff: lazy(() => import('./pages/Staff')),
  training: lazy(() => import('./pages/Training')),
  courses: lazy(() => import('./pages/Courses')),
  students: lazy(() => import('./pages/Students')),
  research: lazy(() => import('./pages/Research')),
  kpi: lazy(() => import('./pages/Kpi')),
  qa: lazy(() => import('./pages/Qa')),
  evidence: lazy(() => import('./pages/Evidence')),
  tasks: lazy(() => import('./pages/Tasks')),
  reports: lazy(() => import('./pages/Reports')),
  ai: lazy(() => import('./pages/Copilot')),
  admin: lazy(() => import('./pages/Admin')),
};
type PageKey = keyof typeof pages;

function Routed() {
  const parts = useRoute();
  const key = (parts[0] && parts[0] in pages ? parts[0] : 'overview') as PageKey;
  const Page = pages[key];
  const known = !parts[0] || parts[0] in pages;
  return (
    <Layout active={key}>
      <ErrorBoundary resetKey={parts.join('/')}>
        <Suspense fallback={<PageSkeleton />}>
          {known ? <Page id={parts[1]} /> : <div className="rounded-xl border border-line bg-white"><ErrorState title="Không tìm thấy trang" message={`Đường dẫn “${parts.join('/')}” không tồn tại. Chọn một mục ở thanh bên (${NAV.length} mục).`} /></div>}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <>
      <AppProvider
        loading={<div className="grid h-full place-items-center"><Loading label="Đang nạp dữ liệu Bộ môn…" /></div>}
        error={(msg, retry) => <div className="grid h-full place-items-center p-4"><div className="w-full max-w-lg rounded-xl border border-line bg-white"><ErrorState title="Không nạp được dữ liệu" message={msg} onRetry={retry} /></div></div>}
        loginPage={login => <Login onLogin={login} />}>
        <Routed />
      </AppProvider>
      <Toaster />
    </>
  );
}
