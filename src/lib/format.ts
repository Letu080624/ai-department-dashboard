/* Định dạng hiển thị (vi-VN). Không chứa logic nghiệp vụ. */
export const num = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('vi-VN', { maximumFractionDigits: d }));
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : `${num(v, d)}%`);
export const date = (iso: string | null | undefined) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };
export const dateTime = (iso: string | null | undefined) => { if (!iso) return '—'; const t = new Date(iso); return Number.isNaN(t.getTime()) ? iso : t.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }); };
export const addDays = (iso: string, n: number) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase();

/**
 * Gộp class Tailwind có xung đột: class truyền vào (extra) THẮNG class mặc định (base) cùng nhóm.
 * Tránh lỗi "w-auto không ghi đè được w-full" vì thứ tự CSS của Tailwind không theo thứ tự class.
 */
const GROUPS: [RegExp, string][] = [
  [/^w-/, 'w'], [/^min-w-/, 'minw'], [/^max-w-/, 'maxw'], [/^h-/, 'h'], [/^min-h-/, 'minh'],
  [/^px-/, 'px'], [/^py-/, 'py'], [/^p-/, 'p'], [/^pl-/, 'pl'], [/^pr-/, 'pr'],
  [/^text-(\[\d|xs$|sm$|base$|lg$|xl$|\dxl$)/, 'fs'], [/^text-(left|center|right)$/, 'ta'], [/^text-/, 'fc'],
  [/^bg-/, 'bg'], [/^border-(?!\d|x-|y-|t-|b-|l-|r-|dashed|solid|dotted|0$)/, 'bc'], [/^rounded/, 'r'], [/^shadow/, 'sh'],
  [/^(block|inline|inline-flex|inline-block|flex|grid|hidden)$/, 'd'],
];
const keyOf = (t: string) => { const i = t.lastIndexOf(':'); const v = i >= 0 ? t.slice(0, i + 1) : ''; const u = i >= 0 ? t.slice(i + 1) : t; const g = GROUPS.find(([re]) => re.test(u)); return g ? v + g[1] : null; };
export function cm(base: string, ...extra: (string | false | null | undefined)[]) {
  const add = extra.filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const drop = new Set(add.map(keyOf).filter(Boolean));
  return [...base.split(/\s+/).filter(t => t && !drop.has(keyOf(t))), ...add].join(' ');
}
