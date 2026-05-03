import { Megaphone, Plus } from "lucide-react";
import { useState } from "react";
import { createRuleCandidateFromAgenda } from "../../../domain/agendaRules";
import {
  createParticipationCode,
  getExistingActivityCodes,
} from "../../../domain/inviteCodes";
import type { AgendaItem, AgendaStatus, ParticipationActivity } from "../../../domain/types";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";

type AgendaViewProps = {
  state: HomeroomState;
  actions: HomeroomActions;
  getStudentName: (studentId: string) => string;
};

const agendaStatusLabels: Record<AgendaStatus, string> = {
  PENDING_REVIEW: "검토 대기",
  SELECTED: "채택",
  DEFERRED: "보류",
  MERGED: "병합됨",
  CLOSED: "종료",
};

export function AgendaView({ state, actions, getStudentName }: AgendaViewProps) {
  const [manualAgendaText, setManualAgendaText] = useState("");
  const pendingCount = state.agendaItems.filter(
    (agenda) => agenda.status === "PENDING_REVIEW",
  ).length;

  function addManualAgenda() {
    const cleanText = manualAgendaText.trim();

    if (cleanText.length === 0) {
      return;
    }

    const nextAgenda: AgendaItem = {
      agendaId: `agenda-${Date.now()}`,
      classId: state.homeroomClass.classId,
      title: cleanText.slice(0, 24),
      originalText: cleanText,
      status: "PENDING_REVIEW",
      submittedAt: state.todayIso,
      isPublic: false,
    };

    actions.setAgendaItems((items) => [nextAgenda, ...items]);
    setManualAgendaText("");
  }

  function updateAgenda(agendaId: string, patch: Partial<AgendaItem>) {
    actions.setAgendaItems((items) =>
      items.map((agenda) => (agenda.agendaId === agendaId ? { ...agenda, ...patch } : agenda)),
    );
  }

  function createCandidate(agenda: AgendaItem) {
    const nextCandidate = createRuleCandidateFromAgenda({
      agenda,
      classId: state.homeroomClass.classId,
      createdAtMs: Date.now(),
    });

    actions.setRuleCandidates((candidates) => [nextCandidate, ...candidates]);
    updateAgenda(agenda.agendaId, { status: "CLOSED" });
  }

  function openAgendaActivity() {
    const nextActivity: ParticipationActivity = {
      activityId: `activity-agenda-${Date.now()}`,
      classId: state.homeroomClass.classId,
      type: "agendaSubmission",
      title: "학급 회의 안건 제출",
      code: createParticipationCode({
        prefix: "AGENDA",
        teacherId: state.teacherId,
        existingCodes: getExistingActivityCodes(state.activities),
      }),
      status: "open",
      opensAt: state.todayIso,
      closesAt: "2026-05-10T18:00:00+09:00",
      isAnonymous: false,
      allowMultipleSubmissions: true,
    };

    actions.setActivities((activities) => [nextActivity, ...activities]);
  }

  return (
    <div className="view-stack">
      <section className="two-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>안건함</h2>
              <p>검토 대기 {pendingCount}건</p>
            </div>
            <button className="primary-button" type="button" onClick={openAgendaActivity}>
              <Megaphone size={16} aria-hidden="true" />
              안건 제출 열기
            </button>
          </div>

          <div className="form-grid">
            <label>
              교사 추가 안건
              <textarea
                value={manualAgendaText}
                onChange={(event) => setManualAgendaText(event.target.value)}
                rows={3}
              />
            </label>
            <button className="secondary-button" type="button" onClick={addManualAgenda}>
              <Plus size={16} aria-hidden="true" />
              안건 추가
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>참여 코드</h2>
          <div className="activity-stack">
            {state.activities
              .filter((activity) => activity.type === "agendaSubmission")
              .map((activity) => (
                <div className="activity-row" key={activity.activityId}>
                  <div>
                    <strong>{activity.title}</strong>
                    <span>{activity.code}</span>
                  </div>
                  <small>{activity.status === "open" ? "열림" : "닫힘"}</small>
                </div>
              ))}
          </div>
        </article>
      </section>

      <section className="agenda-list">
        {state.agendaItems.map((agenda) => (
          <article className="panel agenda-card" key={agenda.agendaId}>
            <div className="panel-heading">
              <div>
                <h2>{agenda.title}</h2>
                <p>
                  {agenda.submittedByStudentId
                    ? `${getStudentName(agenda.submittedByStudentId)} 제출`
                    : "교사 추가"}{" "}
                  · {agendaStatusLabels[agenda.status]}
                </p>
              </div>
              <span className="status-chip">{agenda.isPublic ? "공개" : "비공개"}</span>
            </div>

            <p className="quote-text">{agenda.originalText}</p>
            <label>
              회의용 문장
              <textarea
                value={agenda.meetingText ?? ""}
                onChange={(event) =>
                  updateAgenda(agenda.agendaId, { meetingText: event.target.value })
                }
                rows={3}
              />
            </label>

            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateAgenda(agenda.agendaId, { status: "SELECTED", isPublic: true })}
              >
                채택
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateAgenda(agenda.agendaId, { status: "DEFERRED" })}
              >
                보류
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateAgenda(agenda.agendaId, { status: "MERGED" })}
              >
                병합됨
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateAgenda(agenda.agendaId, { status: "CLOSED" })}
              >
                종료
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={agenda.status !== "SELECTED"}
                onClick={() => createCandidate(agenda)}
              >
                규칙 후보 만들기
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
