import { CheckCircle2, Megaphone, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmRuleCandidate } from "../../../domain/agendaRules";
import {
  createDefaultRuleCheckDate,
  createDefaultVoteClosesAt,
  getCurrentHomeroomIso,
} from "../../../domain/timePolicy";
import {
  createParticipationCode,
  getExistingActivityCodes,
} from "../../../domain/inviteCodes";
import type {
  ParticipationActivity,
  RuleCandidate,
  RuleCandidateStatus,
} from "../../../domain/types";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";

type RulesViewProps = {
  state: HomeroomState;
  actions: HomeroomActions;
};

const ruleStatusLabels: Record<RuleCandidateStatus, string> = {
  DRAFT: "초안",
  COLLECTING_FEEDBACK: "의견 수집",
  VOTING: "투표 중",
  VOTE_CLOSED: "투표 종료",
  CONFIRMED: "확정",
  DISCARDED: "폐기",
  ARCHIVED: "보관",
};

export function resolveRuleCheckDateForConfirmation(params: {
  nowIso: string;
  hasManualCheckDate: boolean;
  checkDate: string;
}): string {
  return params.hasManualCheckDate ? params.checkDate : createDefaultRuleCheckDate(params.nowIso);
}

export function RulesView({ state, actions }: RulesViewProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [checkDate, setCheckDate] = useState(() => createDefaultRuleCheckDate(state.todayIso));
  const [hasManualCheckDate, setHasManualCheckDate] = useState(false);

  useEffect(() => {
    if (hasManualCheckDate) {
      return;
    }

    setCheckDate(createDefaultRuleCheckDate(state.todayIso));
  }, [hasManualCheckDate, state.todayIso]);

  function addCandidate() {
    if (title.trim().length === 0 || description.trim().length === 0) {
      return;
    }

    const nextCandidate: RuleCandidate = {
      ruleCandidateId: `rule-candidate-${Date.now()}`,
      classId: state.homeroomClass.classId,
      title: title.trim(),
      description: description.trim(),
      status: "DRAFT",
      votes: {
        agree: 0,
        needsRevision: 0,
      },
    };

    actions.setRuleCandidates((candidates) => [nextCandidate, ...candidates]);
    setTitle("");
    setDescription("");
  }

  function updateCandidate(candidateId: string, patch: Partial<RuleCandidate>) {
    actions.setRuleCandidates((candidates) =>
      candidates.map((candidate) =>
        candidate.ruleCandidateId === candidateId ? { ...candidate, ...patch } : candidate,
      ),
    );
  }

  function openVote(candidate: RuleCandidate) {
    const nowIso = getCurrentHomeroomIso();

    updateCandidate(candidate.ruleCandidateId, {
      status: "VOTING",
      voteEndsAt: createDefaultVoteClosesAt(nowIso),
    });

    const nextActivity: ParticipationActivity = {
      activityId: `activity-vote-${Date.now()}`,
      classId: state.homeroomClass.classId,
      type: "ruleVote",
      title: `${candidate.title} 투표`,
      targetId: candidate.ruleCandidateId,
      code: createParticipationCode({
        prefix: "VOTE",
        teacherId: state.teacherId,
        existingCodes: getExistingActivityCodes(state.activities),
      }),
      status: "open",
      opensAt: nowIso,
      closesAt: createDefaultVoteClosesAt(nowIso),
      isAnonymous: true,
      allowMultipleSubmissions: false,
    };

    actions.setActivities((activities) => [nextActivity, ...activities]);
  }

  function confirmCandidate(candidate: RuleCandidate) {
    const nowIso = getCurrentHomeroomIso();
    const confirmCheckDate = resolveRuleCheckDateForConfirmation({
      nowIso,
      hasManualCheckDate,
      checkDate,
    });

    const nextRule = confirmRuleCandidate({
      candidate,
      classId: state.homeroomClass.classId,
      checkDate: confirmCheckDate,
      createdAtMs: Date.now(),
    });

    actions.setClassroomRules((rules) => [nextRule, ...rules]);
    updateCandidate(candidate.ruleCandidateId, { status: "CONFIRMED" });
  }

  return (
    <div className="view-stack">
      <section className="two-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>규칙 후보 만들기</h2>
              <p>회의 결과를 학급 약속 후보로 정리합니다.</p>
            </div>
            <Plus size={22} aria-hidden="true" />
          </div>

          <div className="form-grid">
            <label>
              후보 제목
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              설명
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </label>
            <button className="primary-button wide" type="button" onClick={addCandidate}>
              후보 저장
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>확정된 학급 약속</h2>
          <div className="activity-stack">
            {state.classroomRules.map((rule) => (
              <div className="activity-row" key={rule.ruleId}>
                <div>
                  <strong>{rule.title}</strong>
                  <span>{rule.checkDate.slice(0, 10)} 점검</span>
                </div>
                <small>{rule.status === "active" ? "활성" : "보관"}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="candidate-grid">
        {state.ruleCandidates.map((candidate) => (
          <article className="panel" key={candidate.ruleCandidateId}>
            <div className="panel-heading">
              <div>
                <h2>{candidate.title}</h2>
                <p>{candidate.description}</p>
              </div>
              <span className="status-chip">{ruleStatusLabels[candidate.status]}</span>
            </div>

            <div className="vote-meter" aria-label="투표 집계">
              <span style={{ flex: Math.max(candidate.votes.agree, 1) }}>
                동의 {candidate.votes.agree}
              </span>
              <span style={{ flex: Math.max(candidate.votes.needsRevision, 1) }}>
                수정 {candidate.votes.needsRevision}
              </span>
            </div>

            <label>
              점검일
              <input
                value={checkDate}
                onChange={(event) => {
                  setHasManualCheckDate(true);
                  setCheckDate(event.target.value);
                }}
              />
            </label>

            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateCandidate(candidate.ruleCandidateId, { status: "COLLECTING_FEEDBACK" })}
              >
                의견 수집
              </button>
              <button className="secondary-button" type="button" onClick={() => openVote(candidate)}>
                <Megaphone size={16} aria-hidden="true" />
                투표 열기
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateCandidate(candidate.ruleCandidateId, { status: "VOTE_CLOSED" })}
              >
                투표 종료
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={candidate.status !== "VOTE_CLOSED"}
                onClick={() => confirmCandidate(candidate)}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                확정
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
