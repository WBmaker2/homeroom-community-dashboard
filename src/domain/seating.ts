import type {
  SeatAssignment,
  SeatId,
  SeatMap,
  SeatingConflict,
  SeatingConstraint,
  SeatingPlanResult,
  Student,
  StudentId,
} from "./types";

type SeatPosition = {
  seatId: SeatId;
  row: number;
  column: number;
};

const hardPenalty = 1000;

export function createSeatId(row: number, column: number): SeatId {
  return `r${row}c${column}`;
}

export function listAvailableSeats(seatMap: SeatMap): SeatPosition[] {
  const disabled = new Set(seatMap.disabledSeatIds);
  const seats: SeatPosition[] = [];

  for (let row = 1; row <= seatMap.rows; row += 1) {
    for (let column = 1; column <= seatMap.columns; column += 1) {
      const seatId = createSeatId(row, column);

      if (!disabled.has(seatId)) {
        seats.push({ seatId, row, column });
      }
    }
  }

  return seats;
}

export function recommendSeatingPlan(
  students: Student[],
  seatMap: SeatMap,
  constraints: SeatingConstraint[],
): SeatingPlanResult {
  const availableSeats = listAvailableSeats(seatMap);
  const assignments = seedFixedAssignments(students, seatMap, availableSeats);
  const assignedStudents = new Set(assignments.map((assignment) => assignment.studentId));
  const occupiedSeats = new Set(assignments.map((assignment) => assignment.seatId));
  const studentsByConstraintPressure = [...students]
    .filter((student) => !assignedStudents.has(student.studentId))
    .sort(
      (a, b) =>
        countConstraintsForStudent(b.studentId, constraints) -
        countConstraintsForStudent(a.studentId, constraints),
    );

  for (const student of studentsByConstraintPressure) {
    const bestSeat = availableSeats
      .filter((seat) => !occupiedSeats.has(seat.seatId))
      .map((seat) => ({
        seat,
        score: scoreTentativeAssignment(
          [...assignments, { studentId: student.studentId, seatId: seat.seatId }],
          constraints,
          seatMap,
        ),
      }))
      .sort((a, b) => a.score - b.score)[0]?.seat;

    if (bestSeat) {
      assignments.push({ studentId: student.studentId, seatId: bestSeat.seatId });
      occupiedSeats.add(bestSeat.seatId);
    }
  }

  const conflicts = evaluateSeatingConflicts(assignments, constraints, seatMap);

  return {
    assignments,
    conflicts,
    satisfiedCount: constraints.length - conflicts.length,
  };
}

export function evaluateSeatingConflicts(
  assignments: SeatAssignment[],
  constraints: SeatingConstraint[],
  seatMap: SeatMap,
): SeatingConflict[] {
  const conflicts: SeatingConflict[] = [];

  for (const constraint of constraints) {
    const conflict = evaluateConstraint(assignments, constraint, seatMap);

    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

function seedFixedAssignments(
  students: Student[],
  seatMap: SeatMap,
  availableSeats: SeatPosition[],
): SeatAssignment[] {
  const validStudentIds = new Set(students.map((student) => student.studentId));
  const availableSeatIds = new Set(availableSeats.map((seat) => seat.seatId));
  const seenStudents = new Set<StudentId>();
  const seenSeats = new Set<SeatId>();

  return seatMap.fixedAssignments.filter((assignment) => {
    const isValid =
      validStudentIds.has(assignment.studentId) &&
      availableSeatIds.has(assignment.seatId) &&
      !seenStudents.has(assignment.studentId) &&
      !seenSeats.has(assignment.seatId);

    if (isValid) {
      seenStudents.add(assignment.studentId);
      seenSeats.add(assignment.seatId);
    }

    return isValid;
  });
}

function countConstraintsForStudent(
  studentId: StudentId,
  constraints: SeatingConstraint[],
): number {
  return constraints.filter((constraint) => {
    if ("studentId" in constraint) {
      return constraint.studentId === studentId;
    }

    return constraint.studentIds.includes(studentId);
  }).length;
}

function scoreTentativeAssignment(
  assignments: SeatAssignment[],
  constraints: SeatingConstraint[],
  seatMap: SeatMap,
): number {
  return evaluateSeatingConflicts(assignments, constraints, seatMap).reduce(
    (score, conflict) => score + (conflict.severity === "hard" ? hardPenalty : 10),
    0,
  );
}

function evaluateConstraint(
  assignments: SeatAssignment[],
  constraint: SeatingConstraint,
  seatMap: SeatMap,
): SeatingConflict | null {
  if (constraint.type === "frontPreferred" || constraint.type === "visibilityPreferred") {
    const seat = findSeatForStudent(assignments, constraint.studentId, seatMap);

    if (!seat || seat.row <= constraint.frontRows) {
      return null;
    }

    return {
      constraint,
      severity: constraint.strength,
      message: `${constraint.studentId} 학생은 앞 ${constraint.frontRows}줄 안 배치가 권장됩니다.`,
    };
  }

  const firstSeat = findSeatForStudent(assignments, constraint.studentIds[0], seatMap);
  const secondSeat = findSeatForStudent(assignments, constraint.studentIds[1], seatMap);

  if (!firstSeat || !secondSeat) {
    return null;
  }

  const distance = getManhattanDistance(firstSeat, secondSeat);

  if (constraint.type === "separateAdjacent" && distance <= 1) {
    return {
      constraint,
      severity: constraint.strength,
      message: `${constraint.studentIds[0]} 학생과 ${constraint.studentIds[1]} 학생은 인접하지 않게 배치해야 합니다.`,
    };
  }

  if (constraint.type === "supportPair" && distance > constraint.maxDistance) {
    return {
      constraint,
      severity: constraint.strength,
      message: `${constraint.studentIds[0]} 학생과 ${constraint.studentIds[1]} 학생은 거리 ${constraint.maxDistance} 이하가 권장됩니다.`,
    };
  }

  return null;
}

function findSeatForStudent(
  assignments: SeatAssignment[],
  studentId: StudentId,
  seatMap: SeatMap,
): SeatPosition | null {
  const seatId = assignments.find((assignment) => assignment.studentId === studentId)?.seatId;

  if (!seatId) {
    return null;
  }

  return getSeatPosition(seatId, seatMap);
}

function getSeatPosition(seatId: SeatId, seatMap: SeatMap): SeatPosition | null {
  const seat = listAvailableSeats(seatMap).find((candidate) => candidate.seatId === seatId);

  return seat ?? null;
}

function getManhattanDistance(firstSeat: SeatPosition, secondSeat: SeatPosition): number {
  return Math.abs(firstSeat.row - secondSeat.row) + Math.abs(firstSeat.column - secondSeat.column);
}
