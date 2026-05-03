import { recommendSeatingPlan } from "./seating";
import type {
  AgendaItem,
  ClassroomRule,
  DashboardSignals,
  PraiseRecord,
  RuleCandidate,
  SeatMap,
  SeatingConstraint,
  Student,
} from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export function computeDashboardSignals(params: {
  students: Student[];
  praiseRecords: PraiseRecord[];
  agendaItems: AgendaItem[];
  ruleCandidates: RuleCandidate[];
  classroomRules: ClassroomRule[];
  seatMap: SeatMap;
  seatingConstraints: SeatingConstraint[];
  todayIso: string;
  praiseGapDays?: number;
}): DashboardSignals {
  const today = startOfDay(params.todayIso);
  const praiseGapDays = params.praiseGapDays ?? 7;
  const praiseGapCutoff = today.getTime() - praiseGapDays * dayMs;
  const soonCutoff = today.getTime() + dayMs;
  const ruleCheckCutoff = today.getTime() + 3 * dayMs;
  const seatingPlan = recommendSeatingPlan(
    params.students,
    params.seatMap,
    params.seatingConstraints,
  );

  return {
    newAgendaCount: params.agendaItems.filter((item) => item.status === "PENDING_REVIEW").length,
    voteEndingSoonCount: params.ruleCandidates.filter((candidate) => {
      if (candidate.status !== "VOTING" || !candidate.voteEndsAt) {
        return false;
      }

      const voteEndsAt = new Date(candidate.voteEndsAt).getTime();

      return voteEndsAt >= today.getTime() && voteEndsAt <= soonCutoff;
    }).length,
    praiseGapStudents: params.students.filter((student) => {
      const latestPraiseTime = getLatestPraiseTime(params.praiseRecords, student.studentId);

      return latestPraiseTime === null || latestPraiseTime < praiseGapCutoff;
    }),
    seatingConflicts: seatingPlan.conflicts,
    rulesDueSoon: params.classroomRules.filter((rule) => {
      if (rule.status !== "active") {
        return false;
      }

      const checkDate = new Date(rule.checkDate).getTime();

      return checkDate >= today.getTime() && checkDate <= ruleCheckCutoff;
    }),
  };
}

function getLatestPraiseTime(records: PraiseRecord[], studentId: string): number | null {
  const times = records
    .filter((record) => record.studentId === studentId && record.reviewStatus === "approved")
    .map((record) => new Date(record.date).getTime());

  if (times.length === 0) {
    return null;
  }

  return Math.max(...times);
}

function startOfDay(isoDate: string): Date {
  const date = new Date(isoDate);

  date.setHours(0, 0, 0, 0);

  return date;
}
