/* =========================================================================
 * Mô hình dữ liệu nguồn (source data) — tương ứng 1-1 với bảng PostgreSQL ở Production.
 * Mọi chỉ số tổng hợp (tỷ lệ đạt, giờ quy đổi, mức đạt CLO/PLO, trạng thái KPI…) KHÔNG lưu ở đây:
 * chúng được tính từ dữ liệu nguồn trong src/domain/*.
 * ========================================================================= */

export type ID = string;
export type ISODate = string; // 'YYYY-MM-DD'

export interface Audit { createdAt: string; updatedAt: string; createdBy?: ID | null; updatedBy?: ID | null }

/* ---------- Đơn vị, thời gian ---------- */
export interface Unit { id: ID; code: string; name: string; type: 'university' | 'faculty' | 'department'; parentId: ID | null }
export interface AcademicYear { id: ID; code: string; startDate: ISODate; endDate: ISODate }
export interface Semester { id: ID; code: string; name: string; academicYearId: ID; order: number; startDate: ISODate; endDate: ISODate }

/* ---------- Người dùng & phân quyền ---------- */
export type Role = 'ADMIN' | 'HEAD' | 'DEPUTY_HEAD' | 'LECTURER' | 'QA' | 'VIEWER';
export interface User { id: ID; username: string; fullName: string; email: string; role: Role; unitId: ID; lecturerId: ID | null }

/* ---------- Đội ngũ ---------- */
export type Degree = 'TS' | 'ThS' | 'KS';
export type AcademicTitle = 'GS' | 'PGS' | null;
export interface Lecturer {
  id: ID; code: string; fullName: string; unitId: ID;
  position: string;                 // Trưởng BM, Phó BM, Giảng viên…
  degree: Degree; title: AcademicTitle;
  specialization: string;
  employment: 'full_time' | 'visiting';
  status: 'active' | 'leave';
  normHours: number;               // định mức giờ chuẩn/năm
  trainingHours: number;           // giờ bồi dưỡng chuyên môn trong năm
}
/** Hoạt động ngoài giảng lớp được quy đổi giờ (hướng dẫn, chấm, coi thi…) */
export interface OtherLoad { id: ID; lecturerId: ID; academicYearId: ID; activity: string; hours: number }

/* ---------- Đào tạo ---------- */
export interface Program { id: ID; code: string; name: string; level: 'undergraduate' | 'master' }
export interface PLO { id: ID; programId: ID; code: string; description: string; targetPct: number }
export interface AssessmentComponent { code: string; name: string; weight: number }
export interface Course {
  id: ID; code: string; name: string; credits: number; programId: ID; unitId: ID;
  coordinatorId: ID;              // GV phụ trách học phần
  syllabusStatus: 'approved' | 'submitted' | 'draft';
  assessment: AssessmentComponent[];
  passScore: number;              // điểm đạt học phần (thang 10)
}
export interface CLO { id: ID; courseId: ID; code: string; description: string; targetPct: number }
export interface CloPloMap { cloId: ID; ploId: ID; level: 1 | 2 | 3 }
export interface Section {
  id: ID; code: string; courseId: ID; semesterId: ID; lecturerId: ID; className: string;
  plannedSessions: number; deliveredSessions: number;
  hoursFactor: number;            // hệ số quy đổi giờ (lớp đông, sau đại học…)
}
export interface Student { id: ID; code: string; fullName: string; className: string; programId: ID; cohort: string; status: 'studying' | 'graduated' | 'suspended' }
export interface Enrollment {
  id: ID; sectionId: ID; studentId: ID;
  components: Record<string, number | null>;   // điểm thành phần theo AssessmentComponent.code
  absentFinal: boolean;
  cloScores: Record<ID, number>;                // điểm CLO (thang 10) theo CLO.id
}

/* ---------- KPI ---------- */
export type KpiDirection = 'higher_better' | 'lower_better';
export interface KpiDefinition {
  id: ID; code: string; name: string; group: string; unit: string; direction: KpiDirection;
  target: number; deadline: ISODate; ownerId: ID;     // ownerId → User
  source: { type: 'computed'; metric: string } | { type: 'manual' };
  evidenceIds: ID[]; note?: string;
}
/** Kết quả KPI nhập tay (KPI source.type = 'manual'), theo kỳ */
export interface KpiEntry { id: ID; kpiId: ID; periodId: ID; value: number; note?: string; enteredBy: ID; enteredAt: string }

/* ---------- Công việc ---------- */
export type TaskPriority = 'high' | 'medium' | 'low';
export interface Task {
  id: ID; code: string; title: string; ownerId: ID;      // ownerId → Lecturer
  priority: TaskPriority; deadline: ISODate;
  state: 'not_started' | 'in_progress' | 'done';      // trạng thái lưu; "Quá hạn" do quy tắc tính
  completedAt: ISODate | null;
  kpiId: ID | null; qaActivityId: ID | null; createdAt: ISODate;
}

/* ---------- NCKH ---------- */
export type ResearchOutputType = 'journal_article' | 'conference_paper' | 'book' | 'product';
export interface ResearchProject { id: ID; code: string; title: string; level: string; principalId: ID; memberIds: ID[]; startDate: ISODate; endDate: ISODate; progressPct: number; status: 'in_progress' | 'accepted' | 'overdue_report' }
export interface ResearchOutput { id: ID; type: ResearchOutputType; title: string; venue: string; academicYearId: ID; publishedDate: ISODate; authorIds: ID[]; indexed: string | null; projectId: ID | null }

/* ---------- Bảo đảm chất lượng (không hard-code bộ tiêu chuẩn) ---------- */
export interface QaFramework { id: ID; code: string; name: string; version: string; type: string; levels: string[]; active: boolean; note?: string }
export interface QaStandard { id: ID; frameworkId: ID; code: string; name: string; order: number }
export interface QaCriterion { id: ID; standardId: ID; code: string; content: string; requiredEvidence: number }
export type PdcaPhase = 'PLAN' | 'DO' | 'CHECK' | 'ACT';
export interface QaActivity {
  id: ID; code: string; title: string; phase: PdcaPhase; ownerId: ID; startDate: ISODate; dueDate: ISODate;
  progressPct: number; cancelled: boolean; criterionId: ID | null; kpiId: ID | null; resultSummary?: string;
}
export interface QaFinding { id: ID; code: string; activityId: ID | null; criterionId: ID | null; kpiId: ID | null; date: ISODate; type: 'strength' | 'weakness'; statement: string }
export interface ImprovementAction {
  id: ID; code: string; title: string; findingId: ID | null; kpiId: ID | null; ownerId: ID;
  startDate: ISODate; dueDate: ISODate; state: 'planned' | 'in_progress' | 'done'; closedAt: ISODate | null;
  baseline: number | null; expected: number | null;
  origin: 'manual' | 'ai_approved'; aiRecommendationId?: string | null;
}

/* ---------- Minh chứng ---------- */
export interface Evidence {
  id: ID; code: string; name: string; type: string; description: string; ownerId: ID; providerUnit: string;
  kpiIds: ID[]; criterionIds: ID[];
  fileName: string | null; fileHash: string | null;
  updatedAt: ISODate; validUntil: ISODate | null; verified: boolean; verifiedBy: ID | null;
}

/* ---------- Cấu hình (không hard-code ngưỡng nghiệp vụ trong mã) ---------- */
export interface AppSettings {
  referenceDate: ISODate;                  // "hôm nay" của dữ liệu (demo cố định để số liệu ổn định)
  currentAcademicYearId: ID; currentSemesterId: ID;
  kpi: { achievedPct: number; attentionPct: number; atRiskDays: number; decliningPeriods: number; crCapPct: number };
  course: { failRateAlertPct: number; passDropAlertPts: number; cloPassScore: number };
  workload: { overloadRatio: number; underloadRatio: number; hoursPerCredit: number };
  evidence: { expiringDays: number };
  task: { dueSoonDays: number };
  ai: { maxContextChars: number; includeStaffNames: boolean; cacheMinutes: number; model?: string };
}

/** Toàn bộ dữ liệu nguồn của một đơn vị (snapshot) — hình dạng API GET /api/v1/units/{id}/snapshot */
export interface DataSnapshot {
  meta: { schemaVersion: string; generatedAt: string; note: string };
  units: Unit[]; academicYears: AcademicYear[]; semesters: Semester[]; users: User[];
  lecturers: Lecturer[]; otherLoads: OtherLoad[];
  programs: Program[]; plos: PLO[]; courses: Course[]; clos: CLO[]; cloPloMap: CloPloMap[];
  sections: Section[]; students: Student[]; enrollments: Enrollment[];
  kpis: KpiDefinition[]; kpiEntries: KpiEntry[];
  tasks: Task[];
  researchProjects: ResearchProject[]; researchOutputs: ResearchOutput[];
  qaFrameworks: QaFramework[]; qaStandards: QaStandard[]; qaCriteria: QaCriterion[];
  qaActivities: QaActivity[]; qaFindings: QaFinding[]; improvementActions: ImprovementAction[];
  evidence: Evidence[];
  settings: AppSettings;
}

/* ---------- Nhật ký ---------- */
export type AuditAction = 'login' | 'logout' | 'kpi.update' | 'kpi.entry' | 'evidence.update' | 'task.update' | 'ai.request' | 'ai.recommendation.approve' | 'ai.recommendation.reject' | 'report.generate' | 'report.export' | 'settings.update' | 'qa.framework.update' | 'improvement.create' | 'data.reset';
export interface AuditEntry { id: ID; at: string; userId: ID | null; role: Role | null; action: AuditAction; entity: string; entityId: ID | null; before?: unknown; after?: unknown; note?: string }
