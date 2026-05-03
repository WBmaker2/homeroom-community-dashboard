import type {
  AgendaItem,
  ClassroomRule,
  HomeroomClass,
  ParticipationActivity,
  ParticipationSubmission,
  PraiseRecord,
  RuleCandidate,
  SeatMap,
  SeatingConstraint,
} from "../domain/types";

export const sampleClass: HomeroomClass = {
  classId: "class-2026-01",
  name: "6학년 2반",
  gradeBand: "elementary",
  status: "active",
  students: [
    { studentId: "s01", studentNumber: "1", name: "김민준", displayName: "민준" },
    { studentId: "s02", studentNumber: "2", name: "이서연", displayName: "서연" },
    { studentId: "s03", studentNumber: "3", name: "박지후", displayName: "지후" },
    { studentId: "s04", studentNumber: "4", name: "최하린", displayName: "하린" },
    { studentId: "s05", studentNumber: "5", name: "정도윤", displayName: "도윤" },
    { studentId: "s06", studentNumber: "6", name: "강유나", displayName: "유나" },
    { studentId: "s07", studentNumber: "7", name: "윤서준", displayName: "서준" },
    { studentId: "s08", studentNumber: "8", name: "장예린", displayName: "예린" },
    { studentId: "s09", studentNumber: "9", name: "한지민", displayName: "지민" },
    { studentId: "s10", studentNumber: "10", name: "오시우", displayName: "시우" },
  ],
};

export const sampleSeatMap: SeatMap = {
  rows: 4,
  columns: 4,
  disabledSeatIds: ["r4c4"],
  fixedAssignments: [{ studentId: "s03", seatId: "r1c2" }],
};

export const sampleSeatingConstraints: SeatingConstraint[] = [
  { type: "frontPreferred", studentId: "s01", frontRows: 2, strength: "hard" },
  { type: "visibilityPreferred", studentId: "s02", frontRows: 2, strength: "hard" },
  { type: "separateAdjacent", studentIds: ["s04", "s05"], strength: "hard" },
  { type: "supportPair", studentIds: ["s07", "s08"], maxDistance: 2, strength: "soft" },
];

export const samplePraiseRecords: PraiseRecord[] = [
  {
    praiseId: "p01",
    classId: sampleClass.classId,
    studentId: "s01",
    date: "2026-05-02T09:00:00+09:00",
    tags: ["협력", "정리"],
    memo: "모둠 활동 뒤 주변 정리를 먼저 도왔습니다.",
    visibility: "teacherOnly",
    reviewStatus: "approved",
  },
  {
    praiseId: "p02",
    classId: sampleClass.classId,
    studentId: "s06",
    date: "2026-04-24T14:00:00+09:00",
    tags: ["배려"],
    memo: "새 활동을 어려워하는 친구에게 순서를 설명해 주었습니다.",
    visibility: "teacherOnly",
    reviewStatus: "approved",
  },
];

export const sampleAgendaItems: AgendaItem[] = [
  {
    agendaId: "a01",
    classId: sampleClass.classId,
    title: "청소 역할 바꾸는 기준",
    originalText: "청소 역할을 매주 바꾸면 좋겠어요.",
    status: "PENDING_REVIEW",
    submittedAt: "2026-05-03T08:20:00+09:00",
    isPublic: false,
  },
  {
    agendaId: "a02",
    classId: sampleClass.classId,
    title: "쉬는 시간 책상 정리",
    originalText: "쉬는 시간에 책상이 너무 복잡해요.",
    meetingText: "쉬는 시간 책상 위 물건 정리 약속을 정해 봅니다.",
    status: "SELECTED",
    submittedAt: "2026-05-02T11:10:00+09:00",
    isPublic: true,
  },
];

export const sampleRuleCandidates: RuleCandidate[] = [
  {
    ruleCandidateId: "r-candidate-01",
    classId: sampleClass.classId,
    title: "모둠 활동 시작 전 역할 확인하기",
    description: "기록, 발표, 준비 역할을 먼저 확인하고 활동을 시작합니다.",
    status: "VOTING",
    voteEndsAt: "2026-05-03T18:00:00+09:00",
    votes: {
      agree: 18,
      needsRevision: 3,
    },
  },
];

export const sampleClassroomRules: ClassroomRule[] = [
  {
    ruleId: "rule-01",
    classId: sampleClass.classId,
    title: "활동 후 2분 정리",
    description: "활동이 끝나면 자기 자리와 공용 물품을 2분 동안 함께 정리합니다.",
    checkDate: "2026-05-05T09:00:00+09:00",
    status: "active",
  },
];

export const sampleActivities: ParticipationActivity[] = [
  {
    activityId: "activity-vote-01",
    classId: sampleClass.classId,
    type: "ruleVote",
    title: "모둠 활동 시작 전 역할 확인하기 투표",
    targetId: "r-candidate-01",
    code: "WARM-62",
    status: "open",
    opensAt: "2026-05-03T08:00:00+09:00",
    closesAt: "2026-05-03T18:00:00+09:00",
    isAnonymous: true,
    allowMultipleSubmissions: false,
  },
];

export const sampleSubmissions: ParticipationSubmission[] = [
  {
    submissionId: "submission-01",
    classId: sampleClass.classId,
    activityId: "activity-vote-01",
    studentId: "s01",
    submittedAt: "2026-05-03T09:10:00+09:00",
  },
];
