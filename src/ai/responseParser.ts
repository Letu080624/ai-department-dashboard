/* =========================================================================
 * Đọc, kiểm tra và đối chiếu phản hồi của Gemini (dùng chung server + client).
 * 1. extractJson: tách JSON (chịu được ```json``` hoặc lời dẫn thừa).
 * 2. normalize:   ép về đúng cấu trúc (mảng thiếu → [], enum lạ → giá trị an toàn), bỏ trường lạ.
 * 3. enforce:     kỷ luật FACT/INFERENCE — fact sai số/không có ref bị loại hoặc hạ thành inference.
 * 4. verify:      mọi con số trong tóm tắt phải có trong căn cứ; mọi ref phải tồn tại.
 * Kết quả không đạt KHÔNG bị âm thầm sửa: được gắn cảnh báo để người dùng thấy.
 * ========================================================================= */
import type { AiFact, AiFinding, AiRecommendation, AiResponse, AiRisk, Confidence, ReportNarrative } from './schema';
import { REPORT_SECTIONS } from './schema';

export interface ParseChecks { unverifiedNumbers: { value: string; where: string }[]; unknownRefs: string[]; factsRejected: { statement: string; reason: string }[]; downgraded: { where: string; reason: string }[]; removed: { where: string; text: string; values: string[] }[]; actionClaims: { where: string; text: string }[] }
export interface ParseResult<X> { ok: boolean; data: X | null; errors: string[]; checks: ParseChecks; trust: 'verified' | 'warning' | 'failed' }

/* ---------------- 1. Tách JSON ---------------- */
export function extractJson(text: unknown): { value?: unknown; error?: string } {
  if (text && typeof text === 'object') return { value: text };
  const s = String(text ?? '').trim();
  if (!s) return { error: 'Phản hồi rỗng' };
  const tries = [s];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) tries.push(fence[1].trim());
  const start = s.indexOf('{');
  if (start >= 0) { let depth = 0, inStr = false, esc = false; for (let i = start; i < s.length; i++) { const ch = s[i]; if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; } if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { tries.push(s.slice(start, i + 1)); break; } } } }
  for (const t of tries) { try { const v = JSON.parse(t); if (v && typeof v === 'object') return { value: v }; } catch { /* thử tiếp */ } }
  return { error: 'Không đọc được JSON từ phản hồi của AI' };
}

/* ---------------- 2. Chuẩn hoá ---------------- */
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, max);
const arr = <X,>(v: unknown, f: (x: Record<string, unknown>) => X | null, max = 30): X[] => (Array.isArray(v) ? v : []).slice(0, max).map(x => (x && typeof x === 'object' ? f(x as Record<string, unknown>) : null)).filter((x): x is X => x !== null);
const en = <X extends string>(v: unknown, opts: readonly X[], dflt: X): X => { const s = str(v).toLowerCase(); return (opts.find(o => o.toLowerCase() === s) ?? dflt); };
const conf = (v: unknown): Confidence => en(v, ['high', 'medium', 'low'] as const, 'low');
const strs = (v: unknown, max = 20) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map(x => str(x, 600)).filter(Boolean).slice(0, max);
/** Trường do HỆ THỐNG gắn (verified/downgraded…) — chỉ giữ khi đọc kết quả đã kiểm ở server của mình */
const sys = <X extends object>(o: Record<string, unknown>, x: X, keep: boolean): X => (keep ? Object.assign(x, o.verified !== undefined ? { verified: !!o.verified } : {}, o.downgraded ? { downgraded: true, downgrade_reason: str(o.downgrade_reason, 300) } : {}) : x);

function normRec(o: Record<string, unknown>): AiRecommendation | null {
  const action = str(o.action, 500); if (!action) return null;
  return { action, rationale: str(o.rationale, 600), owner_role: str(o.owner_role, 120) || 'chưa xác định', due_hint: str(o.due_hint, 120), success_measure: str(o.success_measure, 300), priority: en(o.priority, ['high', 'medium', 'low'] as const, 'medium'), refs: strs(o.refs), kpi_ref: str(o.kpi_ref, 40) || undefined, propose_improvement_action: !!o.propose_improvement_action };
}
export function normalizeResponse(v: unknown, keepSystem = false): AiResponse {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    summary: str(o.summary, 3000),
    facts: arr(o.facts, f => { const statement = str(f.statement, 600); const ref = str(f.ref, 80); if (!statement) return null; const value = typeof f.value === 'number' ? f.value : Number.isFinite(Number(f.value)) && f.value !== '' && f.value !== null && f.value !== undefined ? Number(f.value) : null; return sys(f, { statement, value, unit: str(f.unit, 40) || undefined, ref } as AiFact, keepSystem); }),
    findings: arr(o.findings, f => { const statement = str(f.statement, 800); if (!statement) return null; return sys(f, { statement, kind: en(f.kind, ['fact', 'inference'] as const, 'inference'), polarity: en(f.polarity, ['positive', 'negative', 'neutral'] as const, 'neutral'), refs: strs(f.refs), confidence: conf(f.confidence), verify_by: str(f.verify_by, 400) || undefined } as AiFinding, keepSystem); }),
    risks: arr(o.risks, f => { const statement = str(f.statement, 800); if (!statement) return null; return sys(f, { statement, kind: en(f.kind, ['fact', 'inference'] as const, 'inference'), likelihood: conf(f.likelihood), impact: str(f.impact, 400), refs: strs(f.refs), confidence: conf(f.confidence), verify_by: str(f.verify_by, 400) || undefined } as AiRisk, keepSystem); }),
    recommendations: arr(o.recommendations, normRec, 12),
    priority_actions: arr(o.priority_actions, normRec, 5),
    data_gaps: strs(o.data_gaps),
    confidence: conf(o.confidence),
    insufficient_data: !!o.insufficient_data,
  };
}
export function normalizeReport(v: unknown, keepSystem = false): ReportNarrative {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const keys = REPORT_SECTIONS.map(s => s.key) as string[];
  return {
    sections: arr(o.sections, s => { const key = str(s.key); if (!keys.includes(key)) return null; return { key: key as ReportNarrative['sections'][number]['key'], paragraphs: arr(s.paragraphs, p => { const text = str(p.text, 1500); if (!text) return null; return sys(p, { text, kind: en(p.kind, ['fact', 'inference'] as const, 'inference'), refs: strs(p.refs) }, keepSystem); }, 6) }; }, 12),
    recommendations: arr(o.recommendations, normRec, 12),
    data_gaps: strs(o.data_gaps),
    confidence: conf(o.confidence),
  };
}

/* ---------------- 3–4. Đối chiếu với DATA CONTEXT ---------------- */
/** Bỏ các chuỗi không phải số liệu: mã (KPI-SV-02, CLO3, HK2 25-26, GV05), ngày, năm học */
export function stripCodes(s: string): string {
  return String(s)
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?\b/g, ' ').replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b(19|20)\d{2}\s*[–-]\s*(19|20)\d{2}\b/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[A-Za-zĐđÀ-ỹ]+[-_.:]?[A-Za-zĐđÀ-ỹ0-9]*\d+(?:[.:*-][\dA-Za-z*]+)*/g, ' ')
    .replace(/\b\d{2}\s*[–-]\s*\d{2}\b/g, ' ');
}
export function toNum(m: string): number | null {
  let x = String(m).trim();
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '').replace(',', '.'); else x = x.replace(',', '.');
  const n = parseFloat(x); return Number.isFinite(n) ? n : null;
}
/** Khớp nếu bằng nhau (sai số làm tròn), bỏ qua dấu ("giảm 6,8" cho -6,8), hoặc là số nguyên làm tròn */
const near = (a: number, b: number) => { const x = Math.abs(a), y = Math.abs(b); return Math.abs(x - y) <= Math.max(0.051, y * 0.005) || (Number.isInteger(x) && Math.abs(x - y) < 0.5); };
const numsIn = (s: string) => { const out: { m: string; n: number }[] = []; stripCodes(s).replace(/-?\d+(?:[.,]\d+)*/g, m => { const n = toNum(m); if (n !== null) out.push({ m, n }); return m; }); return out; };
const isTrivial = (n: number) => (Number.isInteger(n) && Math.abs(n) <= 20) || n === 0 || n === 100;

function collectNums(v: unknown, out: number[]) {
  if (typeof v === 'number') out.push(v);
  else if (typeof v === 'string') numsIn(v).forEach(x => out.push(x.n));
  else if (Array.isArray(v)) v.forEach(x => collectNums(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => collectNums(x, out));
}
/** ref → mọi con số trong bản ghi mang ref đó (kể cả lồng nhau) */
export function refNumbers(ctx: unknown): Map<string, number[]> {
  const map = new Map<string, number[]>();
  (function walk(v: unknown) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.ref === 'string') { const nums: number[] = []; collectNums(o, nums); map.set(o.ref, (map.get(o.ref) ?? []).concat(nums)); } Object.values(o).forEach(walk); }
  })(ctx);
  return map;
}
export function allNumbers(ctx: unknown) { const out: number[] = []; collectNums(ctx, out); return out; }
const badNums = (s: string, pool: number[]) => numsIn(s).filter(x => !isTrivial(x.n) && !pool.some(y => near(x.n, y))).map(x => x.m);

/* ---------------- 5. Kiểm tra ngữ nghĩa (bổ sung sau kiểm thử Copilot C09/C11/C12/C20/C23) ---------------- */
/** ref KPI → trạng thái do QUY TẮC hệ thống tính (AI không được chấm lại) */
export function refStatus(ctx: unknown): Map<string, string> {
  const map = new Map<string, string>();
  (function walk(v: unknown) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.ref === 'string' && /^KPI-/.test(o.ref) && typeof o.status === 'string') map.set(o.ref, o.status); Object.values(o).forEach(walk); }
  })(ctx);
  return map;
}
const CLAIM_NOT = /(không|chưa)\s+(đạt|hoàn thành)|quá hạn|dưới\s+(mục tiêu|chỉ tiêu)|thấp hơn\s+(mục tiêu|chỉ tiêu)/i;
const CLAIM_ACH = /đạt(\s+được)?\s+(mục tiêu|chỉ tiêu)|hoàn thành\s+(mục tiêu|chỉ tiêu)|vượt\s+(mục tiêu|chỉ tiêu)|\bđã đạt\b/i;
/** Câu khẳng định trạng thái KPI trái với quy tắc hệ thống (vd. nói "đã đạt" khi quy tắc = Cần chú ý) */
export function statusConflict(text: string, refs: string[], rs: Map<string, string>): string | null {
  const not = CLAIM_NOT.test(text), ach = !not && CLAIM_ACH.test(text);
  for (const r of refs) { const st = rs.get(r); if (!st) continue;
    if (ach && st !== 'Đạt') return `mâu thuẫn trạng thái do quy tắc xác định (${r}: ${st})`;
    if (not && st === 'Đạt' && !/quá hạn/i.test(text)) return `mâu thuẫn trạng thái do quy tắc xác định (${r}: ${st})`; }
  return null;
}
/** Khẳng định nguyên nhân — không phải dữ kiện; chỉ được nêu dạng INFERENCE */
const CAUSAL = /(^|[\s,(])(do|vì|bởi|bởi vì|là do|nguyên nhân|dẫn đến|gây ra|xuất phát từ)(?=[\s,:])/i;
export const isCausal = (text: string) => CAUSAL.test(text);
/** AI mô tả như đã tự thay đổi dữ liệu (AI không có quyền ghi) */
const ACTION_CLAIMS = [
  /(tôi|AI|hệ thống|copilot)\s+(đã|vừa)\s+(cập nhật|thay đổi|chỉnh sửa|sửa|xoá|xóa|tạo|thêm|đánh dấu|phê duyệt|duyệt|lưu)/i,
  /(đã|vừa)\s+(cập nhật|thay đổi|chỉnh sửa|sửa)\b.{0,60}\bthành\b/i,
  /(đã|vừa)\s+(đánh dấu|xoá|xóa|phê duyệt)/i,
  /^\s*(đã|vừa)\s+(cập nhật|thay đổi|chỉnh sửa|sửa|tạo|thêm)/i,
];
export const isActionClaim = (text: string) => ACTION_CLAIMS.some(re => re.test(text));
export const ACTION_DISCLAIMER = '[Hệ thống] AI không có quyền thay đổi dữ liệu — không có thay đổi nào được thực hiện. Mọi thay đổi phải do người dùng thao tác trên giao diện.';
/** Lộ chỉ dẫn hệ thống / khung prompt trong phản hồi */
const LEAK = /SYSTEM ROLE:|ANALYSIS RULES|LIMITATIONS:|DATA_CONTEXT_JSON|<<<QUESTION|OUTPUT FORMAT:/;
export const detectLeak = (v: unknown) => LEAK.test(typeof v === 'string' ? v : JSON.stringify(v ?? ''));
/** Chỉ số then chốt cấp Bộ môn: “tỷ lệ đạt”, “điểm trung bình” không gắn mã học phần phải khớp số liệu cấp Bộ môn/học kỳ */
function keyValues(ctx: unknown, key: RegExp, skipUnder: RegExp): number[] {
  const out: number[] = [];
  (function walk(v: unknown, path: string) {
    if (Array.isArray(v)) return v.forEach(x => walk(x, path));
    if (v && typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([k, x]) => { const p = `${path}.${k}`; if (skipUnder.test(p)) return; if (key.test(k) && typeof x === 'number') out.push(x); else walk(x, p); });
  })(ctx, '');
  return out;
}
export function metricMismatches(text: string, ctx: unknown): string[] {
  const bad: string[] = [];
  const dept = (k: RegExp) => keyValues(ctx, k, /\.(courses|course_detail|offerings|kpis|staff|research)\b/);
  const pass = dept(/^pass_rate_pct$/), avg = dept(/^avg_score$/);
  for (const sent of text.split(/[.;\n]/)) {
    if (/\b[A-ZĐ]{2,4}\d{3}\b|CLO|PLO|KPI-/.test(sent)) continue;          // có mã cụ thể → đã kiểm theo ref
    if (pass.length) for (const m of sent.matchAll(/tỷ lệ đạt(?:\s+học phần)?[^\d%]{0,25}?(\d+(?:[.,]\d+)?)\s*%/gi)) { const n = toNum(m[1]); if (n !== null && !pass.some(y => near(n, y))) bad.push(`${m[1]}%`); }
    if (avg.length) for (const m of sent.matchAll(/điểm trung bình[^\d]{0,25}?(\d+(?:[.,]\d+)?)/gi)) { const n = toNum(m[1]); if (n !== null && !avg.some(y => near(n, y))) bad.push(m[1]); }
  }
  return bad;
}

type Claim = { statement?: string; text?: string; kind: 'fact' | 'inference'; refs: string[]; confidence?: Confidence; verify_by?: string; verified?: boolean; downgraded?: boolean; downgrade_reason?: string };
function enforceClaim(c: Claim, where: string, rn: Map<string, number[]>, checks: ParseChecks, rs: Map<string, string> = new Map()) {
  if (c.downgraded) { checks.downgraded.push({ where, reason: c.downgrade_reason || 'đã hạ cấp ở server' }); return; }
  if (c.kind !== 'fact') return;
  const text = c.statement ?? c.text ?? '';
  let why: string | null = null;
  if (!c.refs.length) why = 'không có tham chiếu dữ liệu';
  else if (c.refs.some(r => !rn.has(r))) why = `tham chiếu không tồn tại: ${c.refs.filter(r => !rn.has(r)).join(', ')}`;
  else { const bad = badNums(text, c.refs.flatMap(r => rn.get(r)!)); if (bad.length) why = `số liệu không có trong bản ghi tham chiếu: ${bad.join(', ')}`; }
  if (!why) why = statusConflict(text, c.refs, rs);
  if (!why && isCausal(text)) why = 'khẳng định nguyên nhân — dữ liệu không chứng minh quan hệ nhân quả';
  if (!why && isActionClaim(text)) { why = 'AI mô tả một thay đổi dữ liệu không có thật'; checks.actionClaims.push({ where, text: text.slice(0, 200) }); }
  if (why) { c.kind = 'inference'; c.downgraded = true; c.downgrade_reason = why; c.verify_by = c.verify_by || 'Đối chiếu với dữ liệu nguồn trước khi sử dụng'; if (c.confidence === 'high') c.confidence = 'medium'; checks.downgraded.push({ where, reason: why }); }
  else c.verified = true;
}
const emptyChecks = (): ParseChecks => ({ unverifiedNumbers: [], unknownRefs: [], factsRejected: [], downgraded: [], removed: [], actionClaims: [] });
/** Gộp kết quả kiểm tra của server và client (client không được làm mất cảnh báo server đã phát hiện) */
export function mergeChecks(a: Partial<ParseChecks> | null | undefined, b: ParseChecks): ParseChecks {
  const u = <X,>(x: X[] = [], y: X[] = []) => { const seen = new Set<string>(); return [...x, ...y].filter(i => { const k = JSON.stringify(i); if (seen.has(k)) return false; seen.add(k); return true; }); };
  return { unverifiedNumbers: u(a?.unverifiedNumbers, b.unverifiedNumbers), unknownRefs: u(a?.unknownRefs, b.unknownRefs), factsRejected: u(a?.factsRejected, b.factsRejected), downgraded: u(a?.downgraded, b.downgraded), removed: u(a?.removed, b.removed), actionClaims: u(a?.actionClaims, b.actionClaims) };
}
export const trustOf = (c: ParseChecks): 'verified' | 'warning' => (c.unverifiedNumbers.length || c.unknownRefs.length || c.factsRejected.length || c.downgraded.length || c.removed.length || c.actionClaims.length ? 'warning' : 'verified');

/** Toàn bộ quy trình cho phản hồi Copilot */
export function parseResponse(raw: unknown, ctx: unknown, opt: { trustedSystemFields?: boolean } = {}): ParseResult<AiResponse> {
  const ex = extractJson(raw);
  if (ex.error) return { ok: false, data: null, errors: [ex.error], checks: emptyChecks(), trust: 'failed' };
  if (detectLeak(ex.value)) return { ok: false, data: null, errors: ['policy_leak: phản hồi chứa nội dung chỉ dẫn hệ thống'], checks: emptyChecks(), trust: 'failed' };
  const d = normalizeResponse(ex.value, !!opt.trustedSystemFields);
  if (!d.summary && !d.facts.length && !d.findings.length) return { ok: false, data: d, errors: ['Phản hồi thiếu nội dung bắt buộc (summary/facts/findings)'], checks: emptyChecks(), trust: 'failed' };
  const checks = emptyChecks(); const rn = refNumbers(ctx); const rs = refStatus(ctx);
  // FACT: ref phải tồn tại; giá trị và mọi con số trong câu phải có trong CHÍNH bản ghi ref → nếu không: loại
  d.facts = d.facts.filter(f => {
    const pool = rn.get(f.ref); let why: string | null = null;
    if (!pool) why = `ref "${f.ref}" không có trong dữ liệu`;
    else if (f.value !== null && f.value !== undefined && !pool.some(y => near(f.value!, y))) why = `giá trị ${f.value} không có trong bản ghi ${f.ref}`;
    else { const bad = badNums(f.statement, pool); if (bad.length) why = `số ${bad.join(', ')} không có trong bản ghi ${f.ref}`; }
    if (!why) why = statusConflict(f.statement, [f.ref], rs);
    if (!why && isCausal(f.statement)) why = 'dữ kiện không được chứa khẳng định nguyên nhân';
    if (!why && metricMismatches(f.statement, ctx).length) why = `chỉ số cấp Bộ môn không khớp dữ liệu: ${metricMismatches(f.statement, ctx).join(', ')}`;
    if (!why && isActionClaim(f.statement)) { why = 'AI mô tả một thay đổi dữ liệu không có thật'; checks.actionClaims.push({ where: 'facts', text: f.statement.slice(0, 200) }); }
    if (why) { checks.factsRejected.push({ statement: f.statement, reason: why }); return false; }
    f.verified = true; return true;
  });
  d.findings.forEach((f, i) => enforceClaim(f as Claim, `findings[${i}]`, rn, checks, rs));
  d.risks.forEach((f, i) => enforceClaim(f as Claim, `risks[${i}]`, rn, checks, rs));
  // Tóm tắt: con số phải nằm trong căn cứ (facts + bản ghi facts trích dẫn + OVERVIEW), không chỉ "đâu đó trong context"
  const pool = d.facts.map(f => f.value).filter((x): x is number => typeof x === 'number').concat(...d.facts.map(f => rn.get(f.ref) ?? []), rn.get('OVERVIEW') ?? []);
  badNums(d.summary, pool).forEach(v => checks.unverifiedNumbers.push({ value: v, where: 'summary' }));
  metricMismatches(d.summary, ctx).forEach(v => { if (!checks.unverifiedNumbers.some(x => x.value === v.replace('%', ''))) checks.unverifiedNumbers.push({ value: v, where: 'summary (chỉ số cấp Bộ môn)' }); });
  // AI tự nhận đã thay đổi dữ liệu → gắn tuyên bố hệ thống, không để người dùng hiểu nhầm
  if (isActionClaim(d.summary)) checks.actionClaims.push({ where: 'summary', text: d.summary.slice(0, 200) });
  [...d.recommendations, ...d.priority_actions].forEach((r, i) => { if (isActionClaim(r.action)) checks.actionClaims.push({ where: `recommendations[${i}]`, text: r.action.slice(0, 200) }); });
  if (checks.actionClaims.length && !d.summary.startsWith('[Hệ thống]')) d.summary = `${ACTION_DISCLAIMER} ${d.summary}`;
  // Ref không tồn tại ở mọi nơi
  const used = [...d.findings.flatMap(f => f.refs), ...d.risks.flatMap(f => f.refs), ...d.recommendations.flatMap(r => r.refs), ...d.priority_actions.flatMap(r => r.refs)];
  checks.unknownRefs = [...new Set(used.filter(r => !rn.has(r)))];
  return { ok: true, data: d, errors: [], checks, trust: trustOf(checks) };
}

/** Nhận xét báo cáo — chế độ NGHIÊM NGẶT: đoạn có con số không thuộc bản ghi refs (hoặc không có refs) bị loại */
export function parseReport(raw: unknown, ctx: unknown, opt: { trustedSystemFields?: boolean; strict?: boolean } = {}): ParseResult<ReportNarrative> {
  const ex = extractJson(raw);
  if (ex.error) return { ok: false, data: null, errors: [ex.error], checks: emptyChecks(), trust: 'failed' };
  if (detectLeak(ex.value)) return { ok: false, data: null, errors: ['policy_leak: phản hồi chứa nội dung chỉ dẫn hệ thống'], checks: emptyChecks(), trust: 'failed' };
  const d = normalizeReport(ex.value, !!opt.trustedSystemFields);
  const checks = emptyChecks(); const rn = refNumbers(ctx); const rs = refStatus(ctx); const strict = opt.strict !== false;
  d.sections.forEach(s => {
    s.paragraphs = s.paragraphs.filter((p, j) => {
      const pool = p.refs.flatMap(r => rn.get(r) ?? []);
      const bad = badNums(p.text, pool);
      if (strict && bad.length) { checks.removed.push({ where: `${s.key}[${j}]`, text: p.text, values: bad }); return false; }
      enforceClaim(p as Claim, `${s.key}[${j}]`, rn, checks, rs); return true;
    });
  });
  d.recommendations = d.recommendations.filter((r, j) => { const bad = badNums(`${r.action} ${r.success_measure}`, r.refs.flatMap(x => rn.get(x) ?? [])); if (strict && bad.length) { checks.removed.push({ where: `recommendations[${j}]`, text: r.action, values: bad }); return false; } return true; });
  checks.unknownRefs = [...new Set(d.sections.flatMap(s => s.paragraphs.flatMap(p => p.refs)).filter(r => !rn.has(r)))];
  return { ok: true, data: d, errors: [], checks, trust: trustOf(checks) };
}

/** Tóm tắt cảnh báo kiểm tra để hiển thị */
export function checkWarnings(c: ParseChecks): string[] {
  const w: string[] = [];
  if (c.unverifiedNumbers.length) w.push(`${c.unverifiedNumbers.length} con số trong tóm tắt không có trong căn cứ dữ liệu: ${c.unverifiedNumbers.slice(0, 5).map(x => x.value).join(', ')}.`);
  if (c.factsRejected.length) w.push(`Đã loại ${c.factsRejected.length} dữ kiện có số liệu không khớp bản ghi nguồn.`);
  if (c.downgraded.length) w.push(`${c.downgraded.length} nhận định AI ghi là FACT nhưng không kiểm chứng được → đã chuyển thành INFERENCE.`);
  if (c.unknownRefs.length) w.push(`Tham chiếu không có trong dữ liệu: ${c.unknownRefs.slice(0, 5).join(', ')}.`);
  if (c.actionClaims.length) w.push('AI mô tả như đã thay đổi dữ liệu — KHÔNG có thay đổi nào được thực hiện (AI không có quyền ghi dữ liệu).');
  if (c.removed.length) w.push(`Chế độ nghiêm ngặt: đã loại ${c.removed.length} đoạn có số liệu không tìm thấy trong dữ liệu.`);
  return w;
}
