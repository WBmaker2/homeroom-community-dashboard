import type {
  ActivityId,
  ClassId,
  ParticipationActivity,
  ParticipationSubmission,
  Student,
  StudentId,
} from "./types";

export type SubmissionGate =
  | { ok: true; student: Student; participationKey: string }
  | {
      ok: false;
      reason:
        | "unknownStudent"
        | "activityClosed"
        | "notOpenYet"
        | "alreadySubmitted"
        | "classArchived";
    };

export function normalizeStudentNumber(input: string): string {
  const numeric = input.trim().replace(/\D/g, "");

  return numeric.replace(/^0+(?=\d)/, "");
}

export function findStudentByNumber(students: Student[], input: string): Student | null {
  const normalized = normalizeStudentNumber(input);

  return (
    students.find((student) => normalizeStudentNumber(student.studentNumber) === normalized) ??
    null
  );
}

export function buildParticipationKey(
  classId: ClassId,
  activityId: ActivityId,
  studentId: StudentId,
): string {
  return `${classId}:${activityId}:${studentId}`;
}

export function canAcceptSubmission(params: {
  activity: ParticipationActivity;
  classStatus?: "active" | "archived";
  students: Student[];
  studentNumberInput: string;
  previousSubmissions: ParticipationSubmission[];
  nowIso: string;
}): SubmissionGate {
  const student = findStudentByNumber(params.students, params.studentNumberInput);

  if (!student) {
    return { ok: false, reason: "unknownStudent" };
  }

  if (params.classStatus === "archived") {
    return { ok: false, reason: "classArchived" };
  }

  const now = new Date(params.nowIso).getTime();
  const opensAt = new Date(params.activity.opensAt).getTime();
  const closesAt = new Date(params.activity.closesAt).getTime();

  if (params.activity.status === "closed" || now > closesAt) {
    return { ok: false, reason: "activityClosed" };
  }

  if (now < opensAt) {
    return { ok: false, reason: "notOpenYet" };
  }

  const participationKey = buildParticipationKey(
    params.activity.classId,
    params.activity.activityId,
    student.studentId,
  );
  const alreadySubmitted = params.previousSubmissions.some(
    (submission) =>
      buildParticipationKey(submission.classId, submission.activityId, submission.studentId) ===
      participationKey,
  );

  if (!params.activity.allowMultipleSubmissions && alreadySubmitted) {
    return { ok: false, reason: "alreadySubmitted" };
  }

  return { ok: true, student, participationKey };
}
