/* =========================================================================
 * evidenceService — Minh chứng: tìm kiếm, trạng thái theo quy tắc (E1–E4), cập nhật, xác nhận.
 * File thật (upload) cần File Storage ở Production; bản Demo chỉ lưu tên file (metadata).
 * ========================================================================= */
import type { EvidenceStatus } from '../domain/rules';
import { dataService } from './dataService';

export const evidenceService = {
  search(q = '', status: EvidenceStatus | 'all' = 'all', type = '') {
    const s = q.trim().toLowerCase();
    return dataService.analytics.evidenceRows().filter(r =>
      (status === 'all' || r.status === status) && (!type || r.e.type === type) &&
      (!s || [r.e.code, r.e.name, r.e.description, r.owner?.fullName ?? ''].some(x => x.toLowerCase().includes(s))));
  },
  types() { return [...new Set(dataService.analytics.d.evidence.map(e => e.type))].sort(); },
  coverage() { return dataService.analytics.coverageAll(); },
  get(id: string) { return dataService.analytics.evidenceRows().find(r => r.e.id === id) ?? null; },
  attachFile(id: string, fileName: string, validUntil: string | null) { return dataService.updateEvidence(id, { fileName, validUntil }); },
  verify(id: string) { return dataService.updateEvidence(id, { verified: true }); },
};
