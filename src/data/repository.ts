/* =========================================================================
 * Repository — lớp truy cập dữ liệu. Component KHÔNG gọi trực tiếp; chỉ dataService dùng.
 *
 *   Dashboard → dataService → Repository → (MockRepository: dữ liệu mẫu + LocalStorage)
 *                                        → (HttpRepository: REST API → PostgreSQL ở Production)
 * Chọn bằng biến build VITE_DATA_SOURCE = 'mock' (mặc định) | 'api'.
 * ========================================================================= */
import seed from './mock/seed.json';
import type { AppSettings, AuditEntry, DataSnapshot, Evidence, ImprovementAction, KpiEntry, QaCriterion, QaFramework, QaStandard, Task } from '../types/domain';

export interface StoredReport { id: string; createdAt: string; createdBy: string; title: string; doc: unknown }
export interface Repository {
  readonly kind: 'mock' | 'api';
  loadSnapshot(): Promise<DataSnapshot>;
  upsert<K extends MutableTable>(table: K, row: RowOf<K>): Promise<void>;
  updateSettings(s: AppSettings): Promise<void>;
  appendAudit(e: AuditEntry): Promise<void>;
  listAudit(): Promise<AuditEntry[]>;
  saveReport(r: StoredReport): Promise<void>;
  listReports(): Promise<StoredReport[]>;
  reset(): Promise<void>;
}
export type MutableTable = 'kpiEntries' | 'tasks' | 'evidence' | 'improvementActions' | 'qaFrameworks' | 'qaStandards' | 'qaCriteria';
type RowOf<K extends MutableTable> = { kpiEntries: KpiEntry; tasks: Task; evidence: Evidence; improvementActions: ImprovementAction; qaFrameworks: QaFramework; qaStandards: QaStandard; qaCriteria: QaCriterion }[K];
export class RepositoryError extends Error { constructor(public code: 'not_implemented' | 'network' | 'invalid', message: string) { super(message); } }

/* ---------- Lưu trữ cục bộ an toàn (trình duyệt có thể chặn) ---------- */
const PREFIX = 'aidash.v1.';
const ls = {
  get<X>(k: string, fb: X): X { try { const r = localStorage.getItem(PREFIX + k); if (r === null) return fb; const v = JSON.parse(r); return v !== null && typeof v === typeof fb && Array.isArray(v) === Array.isArray(fb) ? v : fb; } catch { return fb; } },
  set(k: string, v: unknown) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch { return false; } },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* bỏ qua */ } },
};
export const uiStorage = ls; // dùng cho tuỳ chọn giao diện (bộ lọc, sidebar thu gọn)

/** Demo/MVP: dữ liệu mẫu đóng gói + lớp thay đổi lưu trong LocalStorage của trình duyệt */
export class MockRepository implements Repository {
  readonly kind = 'mock' as const;
  private mem: Record<string, unknown> = {};
  private read<X>(k: string, fb: X): X { return (this.mem[k] as X) ?? ls.get(k, fb); }
  private write(k: string, v: unknown) { this.mem[k] = v; ls.set(k, v); }
  async loadSnapshot(): Promise<DataSnapshot> {
    const base = structuredClone(seed) as unknown as DataSnapshot;
    const patches = this.read<Record<string, Record<string, unknown>>>('patches', {});
    (Object.keys(patches) as MutableTable[]).forEach(t => {
      const rows = base[t] as unknown as { id: string }[];
      Object.values(patches[t] ?? {}).forEach(row => { const r = row as { id: string }; const i = rows.findIndex(x => x.id === r.id); if (i >= 0) rows[i] = r; else rows.push(r); });
    });
    const s = this.read<AppSettings | null>('settings', null as unknown as AppSettings);
    if (s && typeof s === 'object') base.settings = { ...base.settings, ...s };
    return base;
  }
  async upsert<K extends MutableTable>(table: K, row: RowOf<K>) { const p = this.read<Record<string, Record<string, unknown>>>('patches', {}); p[table] = { ...(p[table] ?? {}), [row.id]: row }; this.write('patches', p); }
  async updateSettings(s: AppSettings) { this.write('settings', s); }
  async appendAudit(e: AuditEntry) { const l = this.read<AuditEntry[]>('audit', []); l.unshift(e); this.write('audit', l.slice(0, 500)); }
  async listAudit() { return this.read<AuditEntry[]>('audit', []); }
  async saveReport(r: StoredReport) { const l = this.read<StoredReport[]>('reports', []).filter(x => x.id !== r.id); l.unshift(r); let n = 5; while (n > 0 && !ls.set('reports', l.slice(0, n))) n--; this.mem.reports = l.slice(0, Math.max(n, 1)); }
  async listReports() { return this.read<StoredReport[]>('reports', []); }
  async reset() { this.mem = {}; ls.clear(); }
  /** Có thay đổi so với dữ liệu mẫu gốc không (dùng cho bước chuẩn bị trình diễn) */
  hasChanges() { const p = this.read<Record<string, Record<string, unknown>>>('patches', {}); return Object.values(p).some(t => Object.keys(t ?? {}).length > 0) || !!this.read<unknown>('settings', null as unknown as object); }
}

/**
 * Production: REST API (PostgreSQL phía sau). Đọc đã chạy được với GET /api/v1/snapshot của server.ts;
 * các thao tác ghi cần backend nghiệp vụ (Phase 4) — trả lỗi rõ ràng thay vì giả vờ thành công.
 */
export class HttpRepository implements Repository {
  readonly kind = 'api' as const;
  constructor(private base = '/api/v1') {}
  async loadSnapshot(): Promise<DataSnapshot> {
    let r: globalThis.Response;
    try { r = await fetch(`${this.base}/snapshot`, { credentials: 'same-origin' }); } catch { throw new RepositoryError('network', 'Không kết nối được API dữ liệu'); }
    if (!r.ok) throw new RepositoryError('network', `API dữ liệu lỗi ${r.status}`);
    return r.json();
  }
  private ni(): never { throw new RepositoryError('not_implemented', 'Backend ghi dữ liệu chưa được triển khai (Phase 4: API + PostgreSQL). Hãy dùng chế độ Demo (VITE_DATA_SOURCE=mock).'); }
  async upsert() { this.ni(); }
  async updateSettings() { this.ni(); }
  async appendAudit() { /* Production: audit ghi ở server cùng giao dịch */ }
  async listAudit() { return []; }
  async saveReport() { this.ni(); }
  async listReports() { return []; }
  async reset() { /* không áp dụng */ }
}

export function createRepository(): Repository {
  return import.meta.env?.VITE_DATA_SOURCE === 'api' ? new HttpRepository() : new MockRepository();
}
