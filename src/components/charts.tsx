/* =========================================================================
 * Biểu đồ (Recharts) — quy ước dataviz:
 *  - Màu categorical theo thứ tự cố định (CAT), không xoay vòng; màu trạng thái chỉ dùng cho trạng thái.
 *  - Một trục y; nét mảnh; cột bo 4px ở đầu dữ liệu; tooltip khi rê chuột; chú giải khi ≥ 2 series.
 *  - Mỗi biểu đồ trả lời một câu hỏi quản trị (ghi ở tiêu đề) và có "Xem bảng" (truy cập không cần màu).
 * ========================================================================= */
import { useState, type ReactNode } from 'react';
import { Table2 } from 'lucide-react';
import { Card } from './ui';

export const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const STATUS_COLOR = { ok: '#2f8f55', warn: '#d39e1c', risk: '#dd6b20', bad: '#c53030', neutral: '#a3acb9', info: '#2a78d6' } as const;
export const SEQ = ['#cde2fb', '#86b6ef', '#3987e5', '#2a78d6', '#1c5cab', '#0d366b'];
export const AXIS = { stroke: '#cfd5de', tickLine: false, tick: { fill: '#6b7685', fontSize: 11.5 } } as const;
export const GRID = { stroke: '#e8ebf0', strokeDasharray: '0', vertical: false } as const;
export const TOOLTIP = { cursor: { fill: 'rgba(30,58,95,0.06)' }, contentStyle: { borderRadius: 8, borderColor: '#e3e7ee', fontSize: 12.5 }, labelStyle: { color: '#0f172a', fontWeight: 600 } } as const;

export function ChartCard({ title, question, children, table, height = 260, actions, className, id }: { title: string; question?: string; children: ReactNode; table?: { columns: string[]; rows: (string | number | null)[][] }; height?: number; actions?: ReactNode; className?: string; id?: string }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card id={id} className={className} title={title} subtitle={question} bodyClass="p-3 sm:p-4"
      actions={<>{actions}{table && <button type="button" onClick={() => setShowTable(s => !s)} aria-pressed={showTable} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-2 hover:bg-navy-50 hover:text-navy-700"><Table2 className="size-3.5" />{showTable ? 'Xem biểu đồ' : 'Xem bảng'}</button>}</>}>
      {showTable && table ? (
        <div className="thin-scroll overflow-auto" style={{ maxHeight: height }}>
          <table className="w-full text-[12.5px]"><thead><tr className="border-b border-line text-ink-2">{table.columns.map(c => <th key={c} className="px-2 py-1.5 text-left font-medium">{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-b border-[#eef1f5]">{r.map((c, j) => <td key={j} className="px-2 py-1.5 tabular-nums">{c ?? '—'}</td>)}</tr>)}</tbody></table>
        </div>
      ) : <div style={{ height }} className="w-full min-w-0">{children}</div>}
    </Card>
  );
}

/** Chú giải HTML (chữ dùng màu chữ, ô màu mang danh tính) */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">{items.map(i => <span key={i.label} className="inline-flex items-center gap-1.5">{i.dashed ? <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="inline-block size-2.5 rounded-sm" style={{ background: i.color }} />}{i.label}</span>)}</div>;
}
