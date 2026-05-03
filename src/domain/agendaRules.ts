import type { AgendaItem, ClassroomRule, RuleCandidate } from "./types";

export function createRuleCandidateFromAgenda(params: {
  agenda: AgendaItem;
  classId: string;
  createdAtMs: number;
}): RuleCandidate {
  return {
    ruleCandidateId: `rule-candidate-${params.createdAtMs}`,
    classId: params.classId,
    sourceAgendaId: params.agenda.agendaId,
    title: params.agenda.meetingText || params.agenda.title,
    description: params.agenda.meetingText || params.agenda.originalText,
    status: "DRAFT",
    votes: {
      agree: 0,
      needsRevision: 0,
    },
  };
}

export function confirmRuleCandidate(params: {
  candidate: RuleCandidate;
  classId: string;
  checkDate: string;
  createdAtMs: number;
}): ClassroomRule {
  return {
    ruleId: `rule-${params.createdAtMs}`,
    classId: params.classId,
    title: params.candidate.title,
    description: params.candidate.description,
    checkDate: params.checkDate,
    status: "active",
  };
}
