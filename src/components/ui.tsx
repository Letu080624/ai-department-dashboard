/* =========================================================================
 * UI kit — Card, Button, Badge, StatCard, Progress, Modal, Drawer, Tabs, Field, Alert,
 * EmptyState, ErrorState, Loading, Toast. Dùng chung toàn ứng dụng (design system).
 * ========================================================================= */
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, Info, Loader2, Lock, Minus, SearchX, X, XCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cm, cx } from '../lib/format';

/* ---------------- Card ----------------
 * Thang chữ (typography scale): tiêu đề trang 22/600 · tiêu đề thẻ 15/600 · nội dung 13.5–14 · phụ 12.5 · chú thích 11.5
 * Khoảng cách: lưới 4px; thẻ cách nhau 16px (gap-4); đệm thẻ 16–20px. */
export function Card({ title, subtitle, actions, children, className, bodyClass, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section id={id} className={cm('min-w-0 rounded-xl border border-line bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05)]', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[15px] font-semibold leading-6 text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] leading-5 text-ink-2">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cm('p-4 sm:p-5', bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        {crumbs && <nav aria-label="Đường dẫn" className="mb-1.5 flex flex-wrap items-center gap-1 text-[12.5px] text-ink-2">{crumbs.map((c, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-ink-3">/</span>}{c.href ? <a className="hover:text-navy-700 hover:underline" href={c.href}>{c.label}</a> : <span className="font-medium text-ink">{c.label}</span>}</span>)}</nav>}
        <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-navy-900 sm:text-[22px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:pt-1">{actions}</div>}
    </div>
  );
}
/** Khoảng cách dọc thống nhất giữa các khối trong trang */
export function Stack({ children, className }: { children: ReactNode; className?: string }) { return <div className={cx('space-y-4 sm:space-y-5', className)}>{children}</div>; }

/* ---------------- Button ---------------- */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export function Button({ variant = 'secondary', size = 'md', icon, loading, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-navy-700 text-white hover:bg-navy-800 border-navy-700',
    secondary: 'bg-white text-ink border-line hover:bg-navy-50 hover:border-navy-200',
    ghost: 'bg-transparent text-ink-2 border-transparent shadow-none hover:bg-navy-50 hover:text-navy-700',
    danger: 'bg-white text-bad border-[#f1c4c4] hover:bg-bad-bg',
    success: 'bg-ok text-white border-ok hover:brightness-95',
  };
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading}
      className={cm(cx('inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium shadow-[0_1px_1px_rgb(15_23_42/0.04)] transition-colors disabled:cursor-not-allowed disabled:opacity-55', size === 'sm' ? 'h-8 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]', v[variant]), className)}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ---------------- Badge ---------------- */
export type Tone = 'ok' | 'warn' | 'risk' | 'bad' | 'info' | 'neutral' | 'navy';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', risk: 'bg-risk-bg text-risk', bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info', neutral: 'bg-[#eef1f5] text-ink-2', navy: 'bg-navy-700 text-white',
};
const TONE_ICON: Partial<Record<Tone, ReactNode>> = {
  ok: <CheckCircle2 className="size-3.5" aria-hidden />, warn: <CircleAlert className="size-3.5" aria-hidden />,
  risk: <AlertTriangle className="size-3.5" aria-hidden />, bad: <XCircle className="size-3.5" aria-hidden />,
};
/** Badge trạng thái: luôn có nhãn chữ + biểu tượng (không chỉ dựa vào màu) */
export function Badge({ tone = 'neutral', children, icon = true, title, className, wrap }: { tone?: Tone; children: ReactNode; icon?: boolean; title?: string; className?: string; wrap?: boolean }) {
  return <span title={title} className={cm(cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5', wrap ? 'max-w-full whitespace-normal text-left' : 'shrink-0 whitespace-nowrap', TONE[tone]), className)}>{icon && TONE_ICON[tone]}{children}</span>;
}
/** Nhãn phân loại nội dung AI: FACT / INFERENCE / RECOMMENDATION / SYSTEM */
export function ClaimTag({ kind }: { kind: 'fact' | 'inference' | 'rec' | 'system' }) {
  const m = { fact: ['FACT', 'bg-navy-700 text-white'], inference: ['INFERENCE', 'bg-warn-bg text-warn border border-dashed border-warn'], rec: ['RECOMMENDATION', 'bg-ok-bg text-ok'], system: ['SỐ LIỆU HỆ THỐNG', 'bg-[#e2e8f0] text-[#334155]'] }[kind];
  return <span className={cx('inline-block shrink-0 rounded px-1.5 py-px text-[10px] font-bold tracking-wide', m[1])}>{m[0]}</span>;
}

/* ---------------- Số liệu ---------------- */
export function TrendIcon({ trend, className }: { trend: 'up' | 'down' | 'flat' | 'n/a'; className?: string }) {
  if (trend === 'up') return <span className={cx('inline-flex items-center text-ok', className)} title="Tăng (theo chiều tốt)"><ArrowUpRight className="size-4" /><span className="sr-only">Tăng</span></span>;
  if (trend === 'down') return <span className={cx('inline-flex items-center text-bad', className)} title="Giảm (theo chiều tốt)"><ArrowDownRight className="size-4" /><span className="sr-only">Giảm</span></span>;
  if (trend === 'flat') return <span className={cx('inline-flex items-center text-ink-3', className)} title="Không đổi"><ArrowRight className="size-4" /><span className="sr-only">Không đổi</span></span>;
  return <span className={cx('inline-flex items-center text-ink-3', className)} title="Chưa đủ dữ liệu xu hướng"><Minus className="size-4" /><span className="sr-only">Chưa có xu hướng</span></span>;
}
/** Thẻ chỉ số: nhãn · biểu tượng · giá trị · dòng phụ · chân (thanh tiến độ). Dùng được làm liên kết hoặc bộ lọc (onClick + active). */
export function StatCard({ label, value, sub, icon, tone, href, foot, onClick, active, id }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone; href?: string; foot?: ReactNode; onClick?: () => void; active?: boolean; id?: string }) {
  const interactive = !!(href || onClick);
  const body = (
    <div className={cx('flex h-full flex-col rounded-xl border bg-white p-4 text-left shadow-[0_1px_2px_rgb(15_23_42/0.05)] transition', active ? 'border-navy-500 ring-2 ring-navy-100' : 'border-line', interactive && 'group-hover:border-navy-200 group-hover:shadow-[0_2px_8px_rgb(15_23_42/0.06)]')}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[12.5px] font-medium leading-5 text-ink-2">{label}</p>
        {icon && <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg [&>svg]:size-4', tone && tone !== 'neutral' ? TONE[tone] : 'bg-navy-50 text-navy-700')}>{icon}</span>}
      </div>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      {sub && <div className="mt-2 text-[12px] leading-snug text-ink-2">{sub}</div>}
      {foot && <div className="mt-auto pt-3">{foot}</div>}
    </div>
  );
  if (href) return <a id={id} href={href} className="group block h-full min-w-0 rounded-xl">{body}</a>;
  if (onClick) return <button id={id} type="button" onClick={onClick} aria-pressed={active} className="group block h-full w-full min-w-0 rounded-xl">{body}</button>;
  return <div id={id} className="h-full min-w-0 rounded-xl">{body}</div>;
}
/** Lưới thẻ chỉ số chuẩn (2 cột mobile → 4 cột desktop) */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 4 | 6 }) {
  return <div className={cx('grid grid-cols-2 gap-3 sm:gap-4', cols === 6 ? 'md:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4')}>{children}</div>;
}
export function Progress({ value, tone = 'navy', max = 100, label, className }: { value: number | null; tone?: Tone | 'navy'; max?: number; label?: string; className?: string }) {
  const w = value === null ? 0 : Math.max(0, Math.min(100, value / max * 100));
  const bar = { navy: 'bg-navy-500', ok: 'bg-ok', warn: 'bg-[#d39e1c]', risk: 'bg-risk', bad: 'bg-bad', info: 'bg-info', neutral: 'bg-ink-3' }[tone];
  return <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-[#e9edf3]', className)} role="progressbar" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={max} aria-label={label}><div className={cx('h-full rounded-full', bar)} style={{ width: `${w}%` }} /></div>;
}

/* ---------------- Alert ---------------- */
export function Alert({ tone = 'info', title, children, className, action }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const m = { info: ['border-[#c9d8f5] bg-info-bg text-[#1e3a8a]', <Info key="i" className="mt-0.5 size-4 shrink-0" />], warn: ['border-[#f0dca4] bg-warn-bg text-[#713f12]', <AlertTriangle key="w" className="mt-0.5 size-4 shrink-0" />], bad: ['border-[#f1c4c4] bg-bad-bg text-[#7f1d1d]', <XCircle key="b" className="mt-0.5 size-4 shrink-0" />], ok: ['border-[#bfe3cb] bg-ok-bg text-[#14532d]', <CheckCircle2 key="o" className="mt-0.5 size-4 shrink-0" />] }[tone] as [string, ReactNode];
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]', m[0], className)}>{m[1]}<div className="min-w-0 flex-1">{title && <p className="font-semibold">{title}</p>}{children && <div className="mt-0.5 [&_a]:underline">{children}</div>}</div>{action}</div>;
}

/* ---------------- Trạng thái trống / lỗi / đang tải ---------------- */
export function EmptyState({ title = 'Không có dữ liệu', children, icon, action }: { title?: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"><span className="mb-1 grid size-11 place-items-center rounded-full bg-navy-50 text-navy-500 [&>svg]:size-5">{icon ?? <SearchX className="size-5" />}</span><p className="text-[14px] font-semibold text-ink">{title}</p>{children && <div className="max-w-md text-[13px] leading-relaxed text-ink-2">{children}</div>}{action && <div className="mt-2">{action}</div>}</div>;
}
export function ErrorState({ title = 'Đã xảy ra lỗi', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"><span className="mb-1 grid size-11 place-items-center rounded-full bg-bad-bg text-bad"><XCircle className="size-5" /></span><p className="text-[14px] font-semibold text-ink">{title}</p><p className="max-w-md text-[13px] leading-relaxed text-ink-2">{message}</p>{onRetry && <Button size="sm" className="mt-2" onClick={onRetry}>Thử lại</Button>}</div>;
}
export function Loading({ label = 'Đang tải…', className }: { label?: string; className?: string }) {
  return <div className={cx('flex items-center justify-center gap-2 py-10 text-[13px] text-ink-2', className)} role="status"><Loader2 className="size-4 animate-spin text-navy-500" />{label}</div>;
}
/** Khung trang đang tải (thay cho màn hình trống khi tải trang) */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Đang tải trang" className="animate-in">
      <div className="mb-6 space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-3 rounded-xl border border-line bg-white p-4"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-32" /></div>)}</div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">{[0, 1].map(i => <div key={i} className="space-y-3 rounded-xl border border-line bg-white p-5"><Skeleton className="h-4 w-40" /><Skeleton className="h-48 w-full" /></div>)}</div>
    </div>
  );
}
/** Trạng thái AI đang phân tích (dùng chung mọi nơi gọi AI) */
export function AiLoading({ label = 'AI đang phân tích dữ liệu đã chọn lọc…' }: { label?: string }) {
  return (
    <div role="status" className="space-y-3">
      <p className="flex items-center gap-2 text-[13px] text-ink-2"><Loader2 className="size-4 animate-spin text-navy-500" />{label}</p>
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
    </div>
  );
}
export function NoAccess({ what = 'chức năng này' }: { what?: string }) {
  return <Card><EmptyState icon={<Lock className="size-5" />} title="Không có quyền truy cập">Vai trò hiện tại không được phép sử dụng {what}. Đổi tài khoản demo ở menu người dùng (góc phải) để thử vai trò khác.</EmptyState></Card>;
}
export function Skeleton({ className }: { className?: string }) { return <div className={cx('animate-pulse rounded-md bg-[#e9edf3]', className)} />; }

/* ---------------- Form ---------------- */
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return <label className={cx('block min-w-0', className)}><span className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</span>{children}{error ? <span className="mt-1 block text-[12px] text-bad" role="alert">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-ink-3">{hint}</span> : null}</label>;
}
const inputCls = 'h-9 w-full min-w-0 shadow-[0_1px_1px_rgb(15_23_42/0.03)] rounded-lg border border-line bg-white px-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-[#f4f6fa]';
export function Input(p: InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cm(inputCls, p.className)} />; }
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cm(inputCls + ' cursor-pointer pr-7', p.className)}>{children}</select>; }
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cm(inputCls + ' h-auto min-h-20 py-2 leading-relaxed', p.className)} />; }
/** Thanh bộ lọc: các control nằm trên một hàng, xuống dòng khi hẹp */
export function FilterBar({ children }: { children: ReactNode }) { return <div className="flex flex-wrap items-center gap-2">{children}</div>; }

/* ---------------- Tabs ---------------- */
export function Tabs<K extends string>({ tabs, value, onChange, className }: { tabs: { key: K; label: ReactNode; count?: number }[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('thin-scroll flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map(t => (
        <button key={t.key} role="tab" type="button" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors', value === t.key ? 'border-navy-700 text-navy-800' : 'border-transparent text-ink-2 hover:text-navy-700')}>
          {t.label}{t.count !== undefined && <span className="rounded-full bg-[#eef1f5] px-1.5 text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Modal / Drawer ---------------- */
function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [open, onClose]);
}
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  // Portal ra body: hộp thoại không bị lớp chứa (sticky, transform, z-index) che khuất
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(15_23_42/0.45)] p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" data-modal="center" className={cx('animate-in flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5"><h3 className="text-[15px] font-semibold text-ink">{title}</h3><button type="button" aria-label="Đóng" onClick={onClose} className="rounded-md p-1 text-ink-2 hover:bg-navy-50"><X className="size-4" /></button></div>
        <div className="thin-scroll overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body,
  );
}
export function Drawer({ open, onClose, title, children, footer, id }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; id?: string }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgb(15_23_42/0.4)]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div id={id} role="dialog" aria-modal="true" className="animate-in flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5"><h3 className="min-w-0 truncate text-[15px] font-semibold text-ink">{title}</h3><button type="button" aria-label="Đóng" onClick={onClose} className="rounded-md p-1 text-ink-2 hover:bg-navy-50"><X className="size-4" /></button></div>
        <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body,
  );
}

/* ---------------- Toast ---------------- */
type ToastItem = { id: number; tone: 'ok' | 'bad' | 'info'; text: string };
let toasts: ToastItem[] = []; const tl = new Set<() => void>(); let tid = 0;
const emitT = () => tl.forEach(f => f());
export const toast = {
  show(text: string, tone: ToastItem['tone'] = 'ok') { const id = ++tid; toasts = [...toasts, { id, tone, text }]; emitT(); setTimeout(() => { toasts = toasts.filter(t => t.id !== id); emitT(); }, 4500); },
  ok(t: string) { this.show(t, 'ok'); }, error(t: string) { this.show(t, 'bad'); }, info(t: string) { this.show(t, 'info'); },
};
export function Toaster() {
  const list = useSyncExternalStore(f => { tl.add(f); return () => { tl.delete(f); }; }, () => toasts);
  return <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">{list.map(t => <div key={t.id} className={cx('animate-in pointer-events-auto rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg', t.tone === 'ok' ? 'border-[#bfe3cb] bg-white text-ok' : t.tone === 'bad' ? 'border-[#f1c4c4] bg-white text-bad' : 'border-line bg-white text-ink')}>{t.text}</div>)}</div>;
}

/* ---------------- Tiện ích nhỏ ---------------- */
export function KV({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return <dl className={cx('grid gap-x-6 gap-y-2.5', cols === 1 ? '' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>{items.map((i, k) => <div key={k} className="min-w-0"><dt className="text-[12px] text-ink-3">{i.label}</dt><dd className="mt-0.5 break-words text-[13.5px] text-ink">{i.value}</dd></div>)}</dl>;
}
export function useAsync() {
  const [busy, setBusy] = useState(false);
  const run = async <X,>(fn: () => Promise<X>, okMsg?: string): Promise<X | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast.ok(okMsg); return r; }
    catch (e) { toast.error((e as Error).message || 'Thao tác thất bại'); return undefined; }
    finally { setBusy(false); }
  };
  return { busy, run };
}
