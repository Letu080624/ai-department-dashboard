/* =========================================================================
 * Cấu trúc trả lời của AI (structured output) — dùng chung client + server.
 * JSON Schema dưới đây được gửi cho Gemini qua `responseJsonSchema`; giao diện chỉ hiển thị
 * dữ liệu đã qua aiResponseParser (kiểm tra schema + đối chiếu số liệu).
 * ========================================================================= */

export type Confidence = 'high' | 'medium' | 'low';
export type ClaimKind = 'fact' | 'inference';

export interface AiFact { statement: string; value?: number | null; unit?: string; ref: string; verified?: boolean }
export interface AiFinding { statement: string; kind: ClaimKind; polarity: 'positive' | 'negative' | 'neutral'; refs: string[]; confidence: Confidence; verify_by?: string; verified?: boolean; downgraded?: boolean; downgrade_reason?: string }
export interface AiRisk { statement: string; kind: ClaimKind; likelihood: Confidence; impact: string; refs: string[]; confidence: Confidence; verify_by?: string; verified?: boolean; downgraded?: boolean; downgrade_reason?: string }
export interface AiRecommendation {
  action: string; rationale: string; owner_role: string; due_hint: string; success_measure: string;
  priority: 'high' | 'medium' | 'low'; refs: string[];
  /** Mã KPI liên quan (nếu có) — dùng khi người dùng duyệt thành hành động cải tiến */
  kpi_ref?: string;
  /** AI đề xuất tạo hành động cải tiến; CHỈ được tạo khi người dùng bấm Approve */
  propose_improvement_action: boolean;
}
export interface AiResponse {
  summary: string;
  facts: AiFact[];
  findings: AiFinding[];
  risks: AiRisk[];
  recommendations: AiRecommendation[];
  priority_actions: AiRecommendation[];
  data_gaps: string[];
  confidence: Confidence;
  insufficient_data: boolean;
}

/** Phần nhận xét cho báo cáo Bộ môn (số liệu/bảng do hệ thống dựng, AI chỉ viết nhận xét) */
export const REPORT_SECTIONS = [
  { key: 'executive', title: 'Tóm tắt điều hành' },
  { key: 'staff', title: 'Đội ngũ' },
  { key: 'teaching', title: 'Giảng dạy' },
  { key: 'students', title: 'Kết quả người học' },
  { key: 'research', title: 'Nghiên cứu khoa học' },
  { key: 'kpi', title: 'KPI' },
  { key: 'qa', title: 'Bảo đảm chất lượng' },
  { key: 'evidence', title: 'Minh chứng' },
  { key: 'risks', title: 'Rủi ro' },
  { key: 'improvement', title: 'Hành động cải tiến' },
  { key: 'recommendations', title: 'Khuyến nghị' },
] as const;
export type ReportSectionKey = typeof REPORT_SECTIONS[number]['key'];
export interface ReportNarrative {
  sections: { key: ReportSectionKey; paragraphs: { text: string; kind: ClaimKind; refs: string[]; verified?: boolean; downgraded?: boolean; downgrade_reason?: string }[] }[];
  recommendations: AiRecommendation[];
  data_gaps: string[];
  confidence: Confidence;
}

/* ---------------- JSON Schema (tập con Gemini hỗ trợ) ---------------- */
const str = (description: string) => ({ type: 'string', description });
const conf = { type: 'string', enum: ['high', 'medium', 'low'] };
const refs = { type: 'array', items: { type: 'string' }, description: 'Mã ref có trong DATA CONTEXT (vd. "KPI-SV-02", "COURSE:DAN305", "CLO:DAN305:CLO3", "GV:GV05"). Bắt buộc với nội dung dựa trên dữ liệu.' };
const kind = { type: 'string', enum: ['fact', 'inference'], description: 'fact = đọc trực tiếp từ DATA CONTEXT, số đúng nguyên văn; inference = suy luận, giả thuyết, dự báo' };
const rec = {
  type: 'object',
  properties: {
    action: str('Hành động cụ thể, kiểm chứng được'), rationale: str('Căn cứ dữ liệu'), owner_role: str('Vai trò/người phụ trách theo dữ liệu hoặc "chưa xác định"'),
    due_hint: str('Thời hạn đề xuất'), success_measure: str('Chỉ số/KPI để đo kết quả'), priority: { type: 'string', enum: ['high', 'medium', 'low'] }, refs,
    kpi_ref: str('Mã KPI liên quan nếu có, ví dụ "KPI-SV-02"; để trống nếu không có'),
    propose_improvement_action: { type: 'boolean', description: 'true nếu đề xuất này nên trở thành hành động cải tiến (người dùng sẽ duyệt)' },
  },
  required: ['action', 'rationale', 'owner_role', 'due_hint', 'success_measure', 'priority', 'refs', 'propose_improvement_action'],
};
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: str('Tóm tắt 2–5 câu trả lời trực tiếp yêu cầu. Mọi con số phải có trong facts. Nếu thiếu dữ liệu: "Không đủ dữ liệu để kết luận." và nêu data_gaps.'),
    facts: { type: 'array', description: 'Dữ kiện định lượng làm căn cứ (FACT), 3–10 mục', items: { type: 'object', properties: { statement: str('Dữ kiện'), value: { type: 'number', description: 'Giá trị đúng nguyên văn trong bản ghi ref' }, unit: str('Đơn vị'), ref: str('Mã ref của bản ghi chứa giá trị') }, required: ['statement', 'ref'] } },
    findings: { type: 'array', items: { type: 'object', properties: { statement: str('Nhận định'), kind, polarity: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'positive = điểm nổi bật/điểm mạnh; negative = vấn đề cần chú ý' }, refs, confidence: conf, verify_by: str('Với inference: cần dữ liệu gì để kiểm chứng') }, required: ['statement', 'kind', 'polarity', 'refs', 'confidence'] } },
    risks: { type: 'array', items: { type: 'object', properties: { statement: str('Rủi ro'), kind, likelihood: conf, impact: str('Tác động nếu xảy ra'), refs, confidence: conf, verify_by: str('Cách kiểm chứng') }, required: ['statement', 'kind', 'likelihood', 'impact', 'refs', 'confidence'] } },
    recommendations: { type: 'array', items: rec },
    priority_actions: { type: 'array', items: rec, description: 'Tối đa 3–5 hành động ưu tiên nhất' },
    data_gaps: { type: 'array', items: { type: 'string' }, description: 'Dữ liệu còn thiếu để kết luận chắc chắn' },
    confidence: conf,
    insufficient_data: { type: 'boolean', description: 'true nếu dữ liệu không đủ để trả lời yêu cầu' },
  },
  required: ['summary', 'facts', 'findings', 'risks', 'recommendations', 'priority_actions', 'data_gaps', 'confidence', 'insufficient_data'],
};
export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    sections: { type: 'array', items: { type: 'object', properties: { key: { type: 'string', enum: REPORT_SECTIONS.map(s => s.key) }, paragraphs: { type: 'array', items: { type: 'object', properties: { text: str('Đoạn nhận xét 1–3 câu; không tạo bảng; số liệu đúng nguyên văn'), kind, refs }, required: ['text', 'kind', 'refs'] } } }, required: ['key', 'paragraphs'] } },
    recommendations: { type: 'array', items: rec },
    data_gaps: { type: 'array', items: { type: 'string' } },
    confidence: conf,
  },
  required: ['sections', 'recommendations', 'data_gaps', 'confidence'],
};
