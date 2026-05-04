import type {
  AgendaItem,
  HomeroomClass,
  PraiseRecord,
  SeatAssignment,
  SeatingConstraint,
  Student,
  StudentId,
} from "./types";

export type NewClassInput = {
  name: string;
  gradeBand: HomeroomClass["gradeBand"];
};

export type NewStudentInput = {
  studentNumber: string;
  name: string;
  displayName?: string;
};

export function createHomeroomClass(input: NewClassInput, createdAtMs: number): HomeroomClass {
  return {
    classId: `class-${createdAtMs}`,
    name: input.name.trim(),
    gradeBand: input.gradeBand,
    status: "active",
    students: [],
  };
}

export function createStudent(input: NewStudentInput, createdAtMs: number): Student {
  const name = input.name.trim();
  const displayName = input.displayName?.trim() || name;

  return {
    studentId: `student-${createdAtMs}`,
    studentNumber: normalizeRosterNumber(input.studentNumber),
    name,
    displayName,
  };
}

export function normalizeRosterNumber(input: string): string {
  return input.trim().replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function hasRosterNumberConflict(
  students: Student[],
  studentNumber: string,
  exceptStudentId?: StudentId,
): boolean {
  const normalizedNumber = normalizeRosterNumber(studentNumber);

  if (normalizedNumber.length === 0) {
    return false;
  }

  return students.some(
    (student) =>
      student.studentId !== exceptStudentId &&
      normalizeRosterNumber(student.studentNumber) === normalizedNumber,
  );
}

export function removeStudentFromConstraints(
  constraints: SeatingConstraint[],
  studentId: StudentId,
): SeatingConstraint[] {
  return constraints.filter((constraint) => {
    if ("studentId" in constraint) {
      return constraint.studentId !== studentId;
    }

    return !constraint.studentIds.includes(studentId);
  });
}

export function removeStudentAssignments(
  assignments: SeatAssignment[],
  studentId: StudentId,
): SeatAssignment[] {
  return assignments.filter((assignment) => assignment.studentId !== studentId);
}

export function removeStudentPraiseRecords(
  records: PraiseRecord[],
  classId: string,
  studentId: StudentId,
): PraiseRecord[] {
  return records.filter(
    (record) =>
      record.classId !== classId ||
      (record.studentId !== studentId &&
        record.submittedByStudentId !== studentId),
  );
}

export function detachStudentFromAgendaItems(
  items: AgendaItem[],
  classId: string,
  studentId: StudentId,
): AgendaItem[] {
  return items.map((item) =>
    item.classId === classId && item.submittedByStudentId === studentId
      ? { ...item, submittedByStudentId: undefined }
      : item,
  );
}
