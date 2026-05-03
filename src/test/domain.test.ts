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
  normalizeRosterNumber,
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
import { buildWeeklyPraiseDraft } from "../domain/praise";
import { recommendSeatingPlan } from "../domain/seating";

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
