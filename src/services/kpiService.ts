/* =========================================================================
 * kpiService — KPI: danh sách, lọc theo trạng thái, nhập kết quả tay.
 * Trạng thái KPI do quy tắc trong src/domain/rules.ts quyết định (K0–K4, R1–R2), cấu hình ở Quản trị.
 * ========================================================================= */
import type { KpiStatus } from '../domain/rules';
import { dataService } from './dataService';

export type KpiFilter = 'all' | KpiStatus | 'at_risk';
export const kpiService = {
  list(filter: KpiFilter = 'all', group = '') {
    return dataService.analytics.kpis().filter(k =>
      (filter === 'all' || (filter === 'at_risk' ? k.ev.atRisk : k.ev.status === filter)) && (!group || k.def.group === group));
  },
  groups() { return [...new Set(dataService.analytics.d.kpis.map(k => k.group))]; },
  get(id: string) { return dataService.analytics.kpi(id); },
  counts() { return dataService.analytics.kpiCounts(); },
  chain(id: string) { return dataService.analytics.qaChain(id); },
  saveEntry(kpiId: string, periodId: string, value: number, note: string) { return dataService.saveKpiEntry(kpiId, periodId, value, note); },
  /** Mô tả quy tắc hiện hành (hiển thị cho người dùng — minh bạch cách tính) */
  rulesText() {
    const c = dataService.analytics.settings.kpi;
    return [
      ['K0', 'Thiếu dữ liệu', 'Chưa có giá trị thực tế trong kỳ'],
      ['K1', 'Đạt', `Completion Rate ≥ ${c.achievedPct}%`],
      ['K2', 'Quá hạn', 'Đã qua deadline mà chưa đạt'],
      ['K3', 'Cần chú ý', `${c.attentionPct}% ≤ CR < ${c.achievedPct}%`],
      ['K4', 'Không đạt', `CR < ${c.attentionPct}%`],
      ['R1', 'Cờ nguy cơ', `Chưa đạt và còn ≤ ${c.atRiskDays} ngày đến hạn`],
      ['R2', 'Cờ nguy cơ', `Giảm liên tiếp ≥ ${c.decliningPeriods} kỳ`],
    ] as const;
  },
};
