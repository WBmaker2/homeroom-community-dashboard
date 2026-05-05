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

export type RosterImportStudent = NewStudentInput & {
  rowNumber: number;
};

export type RosterImportIssue = {
  rowNumber: number;
  rawLine: string;
  message: string;
};

export type RosterImportPreview = {
  students: RosterImportStudent[];
  issues: RosterImportIssue[];
  totalRows: number;
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

export function previewRosterImport(
  input: string,
  existingStudents: Student[],
): RosterImportPreview {
  const students: RosterImportStudent[] = [];
  const issues: RosterImportIssue[] = [];
  const seenNumbers = new Set(
    existingStudents.map((student) => normalizeRosterNumber(student.studentNumber)),
  );
  let totalRows = 0;

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const rowNumber = index + 1;
    const line = rawLine.trim();

    if (line.length === 0 || isRosterHeaderRow(line)) {
      return;
    }

    totalRows += 1;

    const parsed = parseRosterImportLine(line);

    if (!parsed) {
      issues.push({
        rowNumber,
        rawLine,
        message: "번호와 이름을 찾을 수 없습니다.",
      });
      return;
    }

    const studentNumber = normalizeRosterNumber(parsed.studentNumber);
    const name = parsed.name.trim();
    const displayName = parsed.displayName?.trim();

    if (studentNumber.length === 0) {
      issues.push({
        rowNumber,
        rawLine,
        message: "학생 번호가 비어 있습니다.",
      });
      return;
    }

    if (name.length === 0) {
      issues.push({
        rowNumber,
        rawLine,
        message: "학생 이름이 비어 있습니다.",
      });
      return;
    }

    if (seenNumbers.has(studentNumber)) {
      issues.push({
        rowNumber,
        rawLine,
        message: "이미 사용 중인 학생 번호입니다.",
      });
      return;
    }

    seenNumbers.add(studentNumber);
    students.push({
      rowNumber,
      studentNumber,
      name,
      displayName,
    });
  });

  return {
    students,
    issues,
    totalRows,
  };
}

function isRosterHeaderRow(line: string): boolean {
  const normalized = line.replace(/\s/g, "").toLowerCase();

  return (
    normalized === "번호,이름,표시명" ||
    normalized === "번호,이름" ||
    normalized === "번호이름표시명" ||
    normalized === "번호이름" ||
    normalized === "studentnumber,name,displayname" ||
    normalized === "number,name,displayname" ||
    normalized === "studentnumbernamedisplayname" ||
    normalized === "numbernamedisplayname"
  );
}

function parseRosterImportLine(line: string): NewStudentInput | null {
  const parts = line.includes(",") ? parseCsvLine(line) : line.split(/\s+/);
  const [studentNumber = "", name = "", ...displayNameParts] = parts.map((part) => part.trim());

  if (studentNumber.length === 0 && name.length === 0) {
    return null;
  }

  return {
    studentNumber,
    name,
    displayName: displayNameParts.join(" "),
  };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  fields.push(current);

  return fields;
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
