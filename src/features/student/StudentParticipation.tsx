import { CheckCircle2, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { canAcceptSubmission, findStudentByNumber } from "../../domain/participation";
import { getCurrentHomeroomIso } from "../../domain/timePolicy";
import type {
  AgendaItem,
  ParticipationActivity,
  ParticipationSubmission,
  PraiseRecord,
} from "../../domain/types";
import type { HomeroomActions, HomeroomState } from "../../state/useHomeroomState";

type StudentParticipationProps = {
  initialCode?: string;
  state: HomeroomState;
  actions: HomeroomActions;
  getStudentName: (studentId: string) => string;
};

export function StudentParticipation({
  initialCode,
  state,
  actions,
}: StudentParticipationProps) {
  const [codeInput, setCodeInput] = useState(initialCode ?? "");
  const [studentNumber, setStudentNumber] = useState("");
  const [content, setContent] = useState("");
  const [targetStudentId, setTargetStudentId] = useState(state.homeroomClass.students[0]?.studentId ?? "");
  const [voteChoice, setVoteChoice] = useState<"agree" | "needsRevision">("agree");
  const [message, setMessage] = useState("");
  const activity = useMemo(
    () =>
      state.activities.find(
        (candidate) => candidate.code.toUpperCase() === codeInput.trim().toUpperCase(),
      ) ?? null,
    [codeInput, state.activities],
  );
  const targetCandidate = activity?.targetId
    ? state.ruleCandidates.find((candidate) => candidate.ruleCandidateId === activity.targetId)
    : null;

  useEffect(() => {
    setCodeInput(initialCode ?? "");
  }, [initialCode]);

  function submit() {
    if (!activity) {
      setMessage("참여 코드를 확인해 주세요.");
      return;
    }

    const nowIso = getCurrentHomeroomIso();

    const gate = canAcceptSubmission({
      activity,
      students: state.homeroomClass.students,
      studentNumberInput: studentNumber,
      previousSubmissions: state.submissions,
      nowIso,
    });

    if (!gate.ok) {
      setMessage(getGateMessage(gate.reason));
      return;
    }

    if (activity.type !== "ruleVote" && content.trim().length === 0) {
      setMessage("내용을 입력해 주세요.");
      return;
    }

    const submittedAt = nowIso;
    const nextSubmission: ParticipationSubmission = {
      submissionId: `submission-${Date.now()}`,
      classId: activity.classId,
      activityId: activity.activityId,
      studentId: gate.student.studentId,
      submittedAt,
      choice: activity.type === "ruleVote" ? voteChoice : undefined,
      content: content.trim() || undefined,
      targetStudentId: activity.type === "praiseReport" ? targetStudentId : undefined,
    };

    if (activity.type === "ruleVote") {
      submitVote(activity, voteChoice);
    }

    if (activity.type === "agendaSubmission") {
      submitAgenda(activity, gate.student.studentId, content.trim(), nowIso);
    }

    if (activity.type === "praiseReport") {
      submitPraiseReport(activity, gate.student.studentId, targetStudentId, content.trim(), nowIso);
    }

    actions.setSubmissions((submissions) => [nextSubmission, ...submissions]);
    setContent("");
    setMessage("제출되었습니다.");
  }

  function submitVote(
    activityToSubmit: ParticipationActivity,
    choice: "agree" | "needsRevision",
  ) {
    if (!activityToSubmit.targetId) {
      return;
    }

    actions.setRuleCandidates((candidates) =>
      candidates.map((candidate) =>
        candidate.ruleCandidateId === activityToSubmit.targetId
          ? {
              ...candidate,
              votes: {
                ...candidate.votes,
                [choice]: candidate.votes[choice] + 1,
              },
            }
          : candidate,
      ),
    );
  }

  function submitAgenda(
    activityToSubmit: ParticipationActivity,
    submittedByStudentId: string,
    cleanContent: string,
    nowIso: string,
  ) {
    const nextAgenda: AgendaItem = {
      agendaId: `agenda-${Date.now()}`,
      classId: activityToSubmit.classId,
      submittedByStudentId,
      title: cleanContent.slice(0, 24),
      originalText: cleanContent,
      status: "PENDING_REVIEW",
      submittedAt: nowIso,
      isPublic: false,
    };

    actions.setAgendaItems((items) => [nextAgenda, ...items]);
  }

  function submitPraiseReport(
    activityToSubmit: ParticipationActivity,
    submittedByStudentId: string,
    studentId: string,
    cleanContent: string,
    nowIso: string,
  ) {
    const nextPraise: PraiseRecord = {
      praiseId: `praise-${Date.now()}`,
      classId: activityToSubmit.classId,
      studentId,
      submittedByStudentId,
      date: nowIso,
      tags: ["학생 제보"],
      memo: cleanContent,
      visibility: "publicAfterReview",
      reviewStatus: "pending",
    };

    actions.setPraiseRecords((records) => [nextPraise, ...records]);
  }

  return (
    <section className="student-shell">
      <div className="student-card">
        <div className="brand-lockup student-brand">
          <div className="brand-mark" aria-hidden="true">
            우
          </div>
          <div>
            <p className="brand-title">오늘 우리 반</p>
            <p className="brand-caption">학생 참여</p>
          </div>
        </div>

        <div className="student-form">
          <label>
            참여 코드
            <input value={codeInput} onChange={(event) => setCodeInput(event.target.value)} />
          </label>
          <label>
            학급 번호
            <input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} />
          </label>
        </div>

        {codeInput.trim().length === 0 ? (
          <div className="participation-panel">
            <h1>참여 코드 입력</h1>
            <p>교사가 알려 준 참여 코드를 입력해 주세요.</p>
          </div>
        ) : activity ? (
          <div className="participation-panel">
            <div className="panel-heading">
              <div>
                <h1>{activity.title}</h1>
                <p>{activity.isAnonymous ? "익명 참여" : "번호 확인 참여"}</p>
              </div>
              <span className="status-chip">{activity.status === "open" ? "열림" : "닫힘"}</span>
            </div>

            {activity.type === "ruleVote" && targetCandidate && (
              <div className="vote-choice">
                <strong>{targetCandidate.title}</strong>
                <p>{targetCandidate.description}</p>
                <div className="segmented-control">
                  <button
                    className={voteChoice === "agree" ? "active" : ""}
                    type="button"
                    onClick={() => setVoteChoice("agree")}
                  >
                    동의
                  </button>
                  <button
                    className={voteChoice === "needsRevision" ? "active" : ""}
                    type="button"
                    onClick={() => setVoteChoice("needsRevision")}
                  >
                    수정 필요
                  </button>
                </div>
              </div>
            )}

            {activity.type === "agendaSubmission" && (
              <label>
                안건
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={5}
                />
              </label>
            )}

            {activity.type === "praiseReport" && (
              <div className="form-grid">
                <label>
                  칭찬할 학생
                  <select
                    value={targetStudentId}
                    onChange={(event) => setTargetStudentId(event.target.value)}
                  >
                    {state.homeroomClass.students.map((student) => (
                      <option key={student.studentId} value={student.studentId}>
                        {student.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  칭찬 내용
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    rows={5}
                  />
                </label>
              </div>
            )}

            {activity.type === "ruleFeedback" && (
              <label>
                의견
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={5}
                />
              </label>
            )}

            <button className="primary-button wide" type="button" onClick={submit}>
              <Send size={16} aria-hidden="true" />
              제출
            </button>
          </div>
        ) : (
          <div className="participation-panel">
            <h1>참여 코드 확인</h1>
            <p>입력한 코드로 열린 활동을 찾을 수 없습니다.</p>
          </div>
        )}

        {message && (
          <p className="student-message" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            {message}
          </p>
        )}
      </div>

      <aside className="student-safe-panel">
        <h2>내 참여 기록</h2>
        <div className="activity-stack">
          {state.submissions
            .filter((submission) => {
              const student = findStudentByNumber(state.homeroomClass.students, studentNumber);

              return student?.studentId === submission.studentId;
            })
            .map((submission) => (
              <div className="activity-row" key={submission.submissionId}>
                <div>
                  <strong>{getActivityTitle(state.activities, submission.activityId)}</strong>
                  <span>{submission.submittedAt.slice(0, 10)}</span>
                </div>
                <small>{submission.choice ? choiceLabel(submission.choice) : "제출"}</small>
              </div>
            ))}
        </div>
      </aside>
    </section>
  );
}

function getGateMessage(reason: "unknownStudent" | "activityClosed" | "notOpenYet" | "alreadySubmitted") {
  if (reason === "unknownStudent") {
    return "학급 번호를 확인해 주세요.";
  }

  if (reason === "activityClosed") {
    return "참여가 종료되었습니다.";
  }

  if (reason === "notOpenYet") {
    return "아직 시작 전입니다.";
  }

  return "이미 참여했습니다.";
}

function getActivityTitle(activities: ParticipationActivity[], activityId: string): string {
  return activities.find((activity) => activity.activityId === activityId)?.title ?? "참여 활동";
}

function choiceLabel(choice: "agree" | "needsRevision"): string {
  return choice === "agree" ? "동의" : "수정";
}
