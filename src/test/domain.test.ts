import { describe, expect, it } from "vitest";
import {
  sampleActivities,
  sampleAgendaItems,
  sampleClass,
  sampleClassroomRules,
  samplePraiseRecords,
  sampleRuleCandidates,
  sampleSeatMap,
  sampleSeatingConstraints,
  sampleSubmissions,
} from "../data/sampleClass";
import { confirmRuleCandidate, createRuleCandidateFromAgenda } from "../domain/agendaRules";
import {
  createHomeroomClass,
  createStudent,
  detachStudentFromAgendaItems,
  hasRosterNumberConflict,
  normalizeRosterNumber,
  previewRosterImport,
  removeStudentAssignments,
  removeStudentFromConstraints,
  removeStudentPraiseRecords,
} from "../domain/classSettings";
import { computeDashboardSignals } from "../domain/dashboardSignals";
import {
  canAcceptSubmission,
  findStudentByNumber,
  normalizeStudentNumber,
} from "../domain/participation";
import {
  TEACHER_ID_STORAGE_KEY,
  createParticipationCode,
  createTeacherId,
  getOrCreateTeacherId,
  getTeacherCodeSegment,
} from "../domain/inviteCodes";
import { buildWeeklyPraiseDraft } from "../domain/praise";
import { recommendSeatingPlan } from "../domain/seating";
import { resolveRuleCheckDateForConfirmation } from "../features/teacher/views/RulesView";
import {
  createDefaultAgendaClosesAt,
  createDefaultRuleCheckDate,
  createDefaultVoteClosesAt,
  formatKoreanDateLabel,
  getCurrentHomeroomIso,
  startOfHomeroomDay,
} from "../domain/timePolicy";

describe("student participation", () => {
  it("normalizes class number input before matching the roster", () => {
    expect(normalizeStudentNumber("  02번 ")).toBe("2");
    expect(findStudentByNumber(sampleClass.students, " 02 ")?.studentId).toBe("s02");
  });

  it("blocks duplicate voting for one-time activities", () => {
    const result = canAcceptSubmission({
      activity: sampleActivities[0],
      students: sampleClass.students,
      studentNumberInput: "1",
      previousSubmissions: sampleSubmissions,
      nowIso: "2026-05-03T10:00:00+09:00",
    });

    expect(result).toEqual({ ok: false, reason: "alreadySubmitted" });
  });

  it("blocks submissions to closed activities", () => {
    const result = canAcceptSubmission({
      activity: { ...sampleActivities[0], status: "closed" },
      students: sampleClass.students,
      studentNumberInput: "2",
      previousSubmissions: [],
      nowIso: "2026-05-03T10:00:00+09:00",
    });

    expect(result).toEqual({ ok: false, reason: "activityClosed" });
  });

  it("blocks submissions for archived classes", () => {
    const result = canAcceptSubmission({
      activity: sampleActivities[0],
      classStatus: "archived",
      students: sampleClass.students,
      studentNumberInput: "2",
      previousSubmissions: [],
      nowIso: "2026-05-03T10:00:00+09:00",
    });

    expect(result).toEqual({ ok: false, reason: "classArchived" });
  });
});

describe("teacher scoped invite codes", () => {
  it("creates different participation codes for different teachers", () => {
    const firstCode = createParticipationCode({
      prefix: "VOTE",
      teacherId: "T-K7Q2M9P4",
      randomSegment: () => "ABCD",
    });
    const secondCode = createParticipationCode({
      prefix: "VOTE",
      teacherId: "T-R8TXF3PA",
      randomSegment: () => "ABCD",
    });

    expect(firstCode).toBe("VOTE-K7Q2-ABCD");
    expect(secondCode).toBe("VOTE-R8TX-ABCD");
  });

  it("rerolls the random part when an activity code already exists", () => {
    const segments = ["ABCD", "EFGH"];
    const code = createParticipationCode({
      prefix: "AGENDA",
      teacherId: "T-K7Q2M9P4",
      existingCodes: ["AGENDA-K7Q2-ABCD"],
      randomSegment: () => segments.shift() ?? "ZZZZ",
    });

    expect(code).toBe("AGENDA-K7Q2-EFGH");
  });

  it("creates a stable teacher segment from a teacher id", () => {
    expect(createTeacherId(() => "K7Q2M9P4")).toBe("T-K7Q2M9P4");
    expect(getTeacherCodeSegment("T-K7Q2M9P4")).toBe("K7Q2");
  });

  it("persists the random teacher id for the current browser storage", () => {
    const storage = createMemoryStorage();
    const teacherId = getOrCreateTeacherId(storage, () => "K7Q2M9P4");

    expect(teacherId).toBe("T-K7Q2M9P4");
    expect(storage.getItem(TEACHER_ID_STORAGE_KEY)).toBe("T-K7Q2M9P4");
    expect(getOrCreateTeacherId(storage, () => "R8TXF3PA")).toBe("T-K7Q2M9P4");
  });

  it("does not keep the old shared sample participation code", () => {
    expect(sampleActivities[0]?.code).not.toBe("WARM-62");
  });
});

describe("seating plan", () => {
  it("keeps fixed assignments and avoids disabled seats", () => {
    const result = recommendSeatingPlan(
      sampleClass.students,
      sampleSeatMap,
      sampleSeatingConstraints,
    );
    const fixed = result.assignments.find((assignment) => assignment.studentId === "s03");

    expect(fixed?.seatId).toBe("r1c2");
    expect(result.assignments.some((assignment) => assignment.seatId === "r4c4")).toBe(false);
  });

  it("returns conflict explanations instead of failing the recommendation", () => {
    const result = recommendSeatingPlan(sampleClass.students, sampleSeatMap, [
      {
        type: "frontPreferred",
        studentId: "s03",
        frontRows: 0,
        strength: "hard",
      },
    ]);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.message).toContain("앞 0줄");
  });
});

describe("dashboard signals", () => {
  it("summarizes the teacher-facing signals for today", () => {
    const signals = computeDashboardSignals({
      students: sampleClass.students,
      praiseRecords: samplePraiseRecords,
      agendaItems: sampleAgendaItems,
      ruleCandidates: sampleRuleCandidates,
      classroomRules: sampleClassroomRules,
      seatMap: sampleSeatMap,
      seatingConstraints: sampleSeatingConstraints,
      todayIso: "2026-05-03T09:00:00+09:00",
    });

    expect(signals.newAgendaCount).toBe(1);
    expect(signals.voteEndingSoonCount).toBe(1);
    expect(signals.praiseGapStudents.length).toBeGreaterThan(0);
    expect(signals.rulesDueSoon).toHaveLength(1);
  });
});

describe("time policy", () => {
  it("formats ISO timestamp to Korean date label", () => {
    expect(formatKoreanDateLabel("2026-05-03T00:00:00+09:00")).toBe("2026년 5월 3일");
  });

  it("returns Seoul day start regardless of input offset", () => {
    expect(startOfHomeroomDay("2026-05-03T15:00:00Z").toISOString()).toBe("2026-05-03T15:00:00.000Z");
  });

  it("gets now in Seoul as ISO-like string", () => {
    expect(getCurrentHomeroomIso(new Date("2026-05-03T00:00:00.000Z"))).toBe("2026-05-03T09:00:00+09:00");
  });

  it("creates agenda closes at 7 days after base date at 18:00", () => {
    expect(createDefaultAgendaClosesAt("2026-05-03T10:00:00+09:00")).toBe("2026-05-10T18:00:00+09:00");
  });

  it("creates vote closes at same-day 18:00 when base time is before cutoff", () => {
    expect(createDefaultVoteClosesAt("2026-05-03T10:00:00+09:00")).toBe("2026-05-03T18:00:00+09:00");
  });

  it("creates vote closes at next day 18:00 when base time is after 18:00", () => {
    expect(createDefaultVoteClosesAt("2026-05-03T18:01:00+09:00")).toBe("2026-05-04T18:00:00+09:00");
  });

  it("creates default classroom rule check date to 7 days later at 09:00", () => {
    expect(createDefaultRuleCheckDate("2026-05-03T10:00:00+09:00")).toBe("2026-05-10T09:00:00+09:00");
  });

  it("handles month and year rollover for default windows", () => {
    expect(createDefaultVoteClosesAt("2026-01-31T18:01:00+09:00")).toBe("2026-02-01T18:00:00+09:00");
    expect(createDefaultRuleCheckDate("2026-12-28T10:00:00+09:00")).toBe("2027-01-04T09:00:00+09:00");
  });
});

describe("rule confirmation date resolution", () => {
  it("uses today+7 09:00 when check date is not manually edited", () => {
    expect(
      resolveRuleCheckDateForConfirmation({
        nowIso: "2026-05-04T10:00:00+09:00",
        hasManualCheckDate: false,
        checkDate: "1989-01-01T09:00:00+09:00",
      }),
    ).toBe("2026-05-11T09:00:00+09:00");
  });

  it("keeps manual check date when user edited it", () => {
    expect(
      resolveRuleCheckDateForConfirmation({
        nowIso: "2026-05-04T10:00:00+09:00",
        hasManualCheckDate: true,
        checkDate: "1989-01-01T09:00:00+09:00",
      }),
    ).toBe("1989-01-01T09:00:00+09:00");
  });
});

describe("praise draft and rule flow", () => {
  it("builds editable weekly praise text only from approved records", () => {
    const draft = buildWeeklyPraiseDraft({
      student: sampleClass.students[0]!,
      records: samplePraiseRecords,
    });

    expect(draft).toContain("민준");
    expect(draft).toContain("모둠 활동");
  });

  it("turns selected agenda into a rule candidate and confirmed rule", () => {
    const candidate = createRuleCandidateFromAgenda({
      agenda: sampleAgendaItems[1],
      classId: sampleClass.classId,
      createdAtMs: 1,
    });
    const rule = confirmRuleCandidate({
      candidate,
      classId: sampleClass.classId,
      checkDate: "2026-05-10T09:00:00+09:00",
      createdAtMs: 2,
    });

    expect(candidate.sourceAgendaId).toBe(sampleAgendaItems[1].agendaId);
    expect(rule.title).toBe(candidate.title);
    expect(rule.status).toBe("active");
  });
});

describe("class settings helpers", () => {
  it("creates classes and students with normalized roster numbers", () => {
    const homeroomClass = createHomeroomClass(
      { name: " 5학년 3반 ", gradeBand: "elementary" },
      10,
    );
    const student = createStudent({ studentNumber: " 03번 ", name: " 홍길동 " }, 11);

    expect(homeroomClass.name).toBe("5학년 3반");
    expect(student.studentNumber).toBe("3");
    expect(student.displayName).toBe("홍길동");
    expect(normalizeRosterNumber(" 001번 ")).toBe("1");
  });

  it("detects duplicate roster numbers after normalization", () => {
    expect(hasRosterNumberConflict(sampleClass.students, "02번")).toBe(true);
    expect(hasRosterNumberConflict(sampleClass.students, "02번", "s02")).toBe(false);
    expect(hasRosterNumberConflict(sampleClass.students, "31")).toBe(false);
  });

  it("previews pasted and CSV roster rows with duplicate validation", () => {
    const preview = previewRosterImport(
      [
        "번호,이름,표시명",
        "31,홍길동,길동",
        "32 김서연 서연",
        "02번 박민준",
        "32 최하늘",
        "33",
        '"34","이,나래","나래"',
      ].join("\n"),
      sampleClass.students,
    );

    expect(preview.totalRows).toBe(6);
    expect(preview.students).toEqual([
      { rowNumber: 2, studentNumber: "31", name: "홍길동", displayName: "길동" },
      { rowNumber: 3, studentNumber: "32", name: "김서연", displayName: "서연" },
      { rowNumber: 7, studentNumber: "34", name: "이,나래", displayName: "나래" },
    ]);
    expect(preview.issues.map((issue) => issue.rowNumber)).toEqual([4, 5, 6]);
    expect(preview.issues[0]?.message).toBe("이미 사용 중인 학생 번호입니다.");
    expect(preview.issues[2]?.message).toBe("학생 이름이 비어 있습니다.");
  });

  it("cleans student-linked class data when a student is deleted", () => {
    const nextAssignments = removeStudentAssignments(
      [
        { studentId: "s01", seatId: "r1c1" },
        { studentId: "s02", seatId: "r1c2" },
      ],
      "s01",
    );
    const nextConstraints = removeStudentFromConstraints(sampleSeatingConstraints, "s01");
    const nextPraise = removeStudentPraiseRecords(samplePraiseRecords, sampleClass.classId, "s01");
    const nextAgenda = detachStudentFromAgendaItems(
      [{ ...sampleAgendaItems[0]!, submittedByStudentId: "s01" }],
      sampleClass.classId,
      "s01",
    );

    expect(nextAssignments).toHaveLength(1);
    expect(nextConstraints.some((constraint) => "studentId" in constraint && constraint.studentId === "s01")).toBe(false);
    expect(nextPraise.some((record) => record.studentId === "s01")).toBe(false);
    expect(nextAgenda[0]?.submittedByStudentId).toBeUndefined();
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}
