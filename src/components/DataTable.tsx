/* DataTable: tìm kiếm, sắp xếp, phân trang; cuộn ngang trên màn hình hẹp (không tràn bố cục). */
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Search } from 'lucide-react';
import { cx } from '../lib/format';
import { EmptyState, Input } from './ui';

export interface Column<R> {
  key: string; header: ReactNode; render: (r: R) => ReactNode;
  sort?: (r: R) => string | number | null; align?: 'left' | 'right' | 'center'; className?: string; hideBelow?: 'sm' | 'md' | 'lg';
}
export function DataTable<R>({ rows, columns, rowKey, search, searchPlaceholder = 'Tìm kiếm…', toolbar, pageSize = 10, onRowClick, empty = 'Không có bản ghi phù hợp', initialSort, dense, caption }: {
  rows: R[]; columns: Column<R>[]; rowKey: (r: R) => string; search?: (r: R) => string; searchPlaceholder?: string; toolbar?: ReactNode;
  pageSize?: number; onRowClick?: (r: R) => void; empty?: ReactNode; initialSort?: { key: string; dir: 'asc' | 'desc' }; dense?: boolean; caption?: string;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = s && search ? rows.filter(r => search(r).toLowerCase().includes(s)) : rows;
    const col = sort && columns.find(c => c.key === sort.key);
    if (col?.sort) {
      const f = col.sort, d = sort!.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => { const x = f(a), y = f(b); if (x === null) return 1; if (y === null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi')) * d; });
    }
    return out;
  }, [rows, q, sort, columns, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const view = filtered.slice(p * pageSize, (p + 1) * pageSize);
  const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
  const toggle = (k: string) => setSort(s => (s?.key === k ? (s.dir === 'asc' ? { key: k, dir: 'desc' } : null) : { key: k, dir: 'asc' }));

  return (
    <div className="min-w-0">
      {(search || toolbar) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {search && <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={q} onChange={e => { setQ(e.target.value); setPage(0); }} className="pl-8" /></div>}
          {toolbar}
        </div>
      )}
      <div className="thin-scroll -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line bg-[#f7f8fb] text-[12px] text-ink-2">
              {columns.map(c => (
                <th key={c.key} scope="col" className={cx('whitespace-nowrap px-3 py-2.5 font-semibold first:rounded-l-md last:rounded-r-md', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideBelow && hide[c.hideBelow], c.className)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-navy-700">{c.header}{sort?.key === c.key ? (sort.dir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />) : <ChevronsUpDown className="size-3.5 opacity-40" />}</button> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} onKeyDown={onRowClick ? e => { if (e.key === 'Enter') onRowClick(r); } : undefined} tabIndex={onRowClick ? 0 : undefined}
                className={cx('border-b border-[#eef1f5] transition-colors last:border-0 hover:bg-[#f9fafc]', onRowClick && 'cursor-pointer hover:bg-navy-50/60')}>
                {columns.map(c => <td key={c.key} className={cx('px-3 align-middle', dense ? 'py-1.5' : 'py-3', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.hideBelow && hide[c.hideBelow], c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length && <EmptyState title={typeof empty === 'string' ? empty : 'Không có dữ liệu'}>{typeof empty === 'string' ? null : empty}</EmptyState>}
      </div>
      {filtered.length > pageSize && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
          <span>Hiển thị {p * pageSize + 1}–{Math.min(filtered.length, (p + 1) * pageSize)} trong {filtered.length} bản ghi</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Trang trước" disabled={p === 0} onClick={() => setPage(p - 1)} className="rounded-md border border-line p-1 disabled:opacity-40 hover:bg-navy-50"><ChevronLeft className="size-4" /></button>
            <span className="px-2">Trang {p + 1}/{pages}</span>
            <button type="button" aria-label="Trang sau" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="rounded-md border border-line p-1 disabled:opacity-40 hover:bg-navy-50"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
