export type StudentId = string;
export type ClassId = string;
export type ActivityId = string;

export type Student = {
  studentId: StudentId;
  studentNumber: string;
  name: string;
  displayName: string;
  supportNotes?: string[];
};

export type HomeroomClass = {
  classId: ClassId;
  name: string;
  gradeBand: "elementary" | "middle" | "high" | "mixed";
  status: "active" | "archived";
  students: Student[];
};

export type SeatId = string;

export type SeatMap = {
  rows: number;
  columns: number;
  disabledSeatIds: SeatId[];
  fixedAssignments: SeatAssignment[];
};

export type SeatAssignment = {
  studentId: StudentId;
  seatId: SeatId;
};

export type ConstraintStrength = "hard" | "soft";

export type FrontPreferredConstraint = {
  type: "frontPreferred";
  studentId: StudentId;
  frontRows: number;
  strength: ConstraintStrength;
};

export type VisibilityPreferredConstraint = {
  type: "visibilityPreferred";
  studentId: StudentId;
  frontRows: number;
  strength: ConstraintStrength;
};

export type SeparateAdjacentConstraint = {
  type: "separateAdjacent";
  studentIds: [StudentId, StudentId];
  strength: ConstraintStrength;
};

export type SupportPairConstraint = {
  type: "supportPair";
  studentIds: [StudentId, StudentId];
  maxDistance: number;
  strength: ConstraintStrength;
};

export type SeatingConstraint =
  | FrontPreferredConstraint
  | VisibilityPreferredConstraint
  | SeparateAdjacentConstraint
  | SupportPairConstraint;

export type SeatingConflict = {
  constraint: SeatingConstraint;
  severity: ConstraintStrength;
  message: string;
};

export type SeatingPlanResult = {
  assignments: SeatAssignment[];
  conflicts: SeatingConflict[];
  satisfiedCount: number;
};

export type PraiseRecord = {
  praiseId: string;
  classId: ClassId;
  studentId: StudentId;
  submittedByStudentId?: StudentId;
  date: string;
  tags: string[];
  memo: string;
  visibility: "teacherOnly" | "publicAfterReview";
  reviewStatus: "approved" | "pending" | "deferred";
};

export type AgendaStatus =
  | "PENDING_REVIEW"
  | "SELECTED"
  | "DEFERRED"
  | "MERGED"
  | "CLOSED";

export type AgendaItem = {
  agendaId: string;
  classId: ClassId;
  submittedByStudentId?: StudentId;
  title: string;
  originalText: string;
  meetingText?: string;
  status: AgendaStatus;
  submittedAt: string;
  isPublic: boolean;
};

export type RuleCandidateStatus =
  | "DRAFT"
  | "COLLECTING_FEEDBACK"
  | "VOTING"
  | "VOTE_CLOSED"
  | "CONFIRMED"
  | "DISCARDED"
  | "ARCHIVED";

export type RuleCandidate = {
  ruleCandidateId: string;
  classId: ClassId;
  sourceAgendaId?: string;
  title: string;
  description: string;
  status: RuleCandidateStatus;
  voteEndsAt?: string;
  votes: {
    agree: number;
    needsRevision: number;
  };
};

export type ClassroomRule = {
  ruleId: string;
  classId: ClassId;
  title: string;
  description: string;
  checkDate: string;
  status: "active" | "archived";
};

export type ParticipationActivityType =
  | "agendaSubmission"
  | "ruleFeedback"
  | "ruleVote"
  | "praiseReport";

export type ParticipationActivity = {
  activityId: ActivityId;
  classId: ClassId;
  type: ParticipationActivityType;
  title: string;
  targetId?: string;
  code: string;
  status: "open" | "closed";
  opensAt: string;
  closesAt: string;
  isAnonymous: boolean;
  allowMultipleSubmissions: boolean;
};

export type ParticipationSubmission = {
  submissionId: string;
  classId: ClassId;
  activityId: ActivityId;
  studentId: StudentId;
  submittedAt: string;
  choice?: "agree" | "needsRevision";
  content?: string;
  targetStudentId?: StudentId;
};

export type DashboardSignals = {
  newAgendaCount: number;
  voteEndingSoonCount: number;
  praiseGapStudents: Student[];
  seatingConflicts: SeatingConflict[];
  rulesDueSoon: ClassroomRule[];
};
