import { ActivitySquare, Copy, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createAbsoluteAppUrl } from "../../../domain/appRoutes";
import {
  getActivityAvailability,
  getActivityAvailabilityLabel,
} from "../../../domain/participation";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";

type ActivityOperationsViewProps = {
  state: HomeroomState;
  actions: HomeroomActions;
  getStudentName: (studentId: string) => string;
};

const activityTypeLabels: Record<HomeroomState["activities"][number]["type"], string> = {
  agendaSubmission: "안건 제출",
  ruleFeedback: "규칙 의견",
  ruleVote: "규칙 투표",
  praiseReport: "칭찬 제보",
};

export function ActivityOperationsView({
  state,
  actions,
  getStudentName,
}: ActivityOperationsViewProps) {
  const isClassArchived = state.homeroomClass.status === "archived";
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(state.activities[0]?.activityId ?? null);
  const [operationMessage, setOperationMessage] = useState("");

  const selectedActivity = useMemo(
    () => state.activities.find((activity) => activity.activityId === selectedActivityId) ?? null,
    [selectedActivityId, state.activities],
  );

  useEffect(() => {
    if (selectedActivityId === null) {
      return;
    }

    if (state.activities.some((activity) => activity.activityId === selectedActivityId)) {
      return;
    }

    setSelectedActivityId(state.activities[0]?.activityId ?? null);
  }, [selectedActivityId, state.activities]);

  const selectedSubmissions = useMemo(
    () =>
      selectedActivityId
        ? state.submissions
            .filter((submission) => submission.activityId === selectedActivityId)
            .slice()
            .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
        : [],
    [selectedActivityId, state.submissions],
  );

  async function copyActivityLink(code: string) {
    const link = createAbsoluteAppUrl(`/join/${encodeURIComponent(code)}`);

    try {
      await navigator.clipboard.writeText(link);
      setOperationMessage(`${code} 링크를 복사했습니다.`);
    } catch {
      setOperationMessage(link);
    }
  }

  return (
    <div className="view-stack">
      {isClassArchived && (
        <p className="archive-notice" role="status">
          보관 학급은 활동 운영을 읽기 전용으로 확인합니다.
        </p>
      )}

      {operationMessage && (
        <p className="link-status" role="status">
          {operationMessage}
        </p>
      )}

      <section className="two-column activity-operations-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>활동 목록</h2>
              <p>활동별 링크 복사, 종료, 재열기, 제출 기록을 관리합니다.</p>
            </div>
            <ActivitySquare size={22} aria-hidden="true" />
          </div>

          <div className="activity-stack">
            {state.activities.length === 0 && <p className="empty-text">등록된 활동이 없습니다.</p>}

            {state.activities.map((activity) => {
              const submissionCount = state.submissions.filter(
                (submission) => submission.activityId === activity.activityId,
              ).length;
              const availability = getActivityAvailability({
                activity,
                nowIso: state.todayIso,
              });
              const isAvailable = availability.isOpen;
              const isSelected = activity.activityId === selectedActivityId;

              return (
                <article
                  className={isSelected ? "activity-row selected" : "activity-row"}
                  key={activity.activityId}
                >
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setSelectedActivityId(activity.activityId)}
                  >
                    <strong>{activity.title}</strong>
                    <span>{activity.code}</span>
                    <span>{activityTypeLabels[activity.type]}</span>
                    <span>{activity.isAnonymous ? "익명" : "기명"}</span>
                    <span>{activity.allowMultipleSubmissions ? "여러 번" : "1회 제한"}</span>
                    <span>상태: {getActivityAvailabilityLabel(availability)}</span>
                    <span>마감: {activity.closesAt.slice(0, 10)}</span>
                    <span>제출 {submissionCount}건</span>
                  </button>

                  <div className="inline-actions">
                    <button
                      className="icon-button"
                      aria-label={`${activity.code} 링크 복사`}
                      disabled={isClassArchived}
                      type="button"
                      onClick={() => copyActivityLink(activity.code)}
                    >
                      <Copy size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${activity.code} 종료`}
                      type="button"
                      disabled={isClassArchived || !isAvailable}
                      onClick={() => {
                        actions.updateActivityStatus(activity.activityId, "closed");
                        setOperationMessage(`${activity.code} 활동을 종료했습니다.`);
                      }}
                    >
                      <Pause size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${activity.code} 다시 열기`}
                      type="button"
                      disabled={isClassArchived || activity.status === "open"}
                      onClick={() => {
                        actions.updateActivityStatus(activity.activityId, "open");
                        setOperationMessage(`${activity.code} 활동을 다시 열었습니다.`);
                      }}
                    >
                      <Play size={16} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>선택 활동 제출 목록</h2>
              <p>
                {selectedActivity
                  ? `${selectedActivity.title} (${selectedActivity.code})`
                  : "제출할 활동을 선택해 주세요."}
              </p>
            </div>
            <ActivitySquare size={22} aria-hidden="true" />
          </div>

          <div className="submission-stack">
            {selectedActivity === null && <p className="empty-text">선택된 활동이 없습니다.</p>}

            {selectedActivity !== null && selectedSubmissions.length === 0 && (
              <p className="empty-text">제출 기록이 없습니다.</p>
            )}

            {selectedActivity !== null &&
              selectedSubmissions.map((submission) => {
                const isAnonymous = selectedActivity.isAnonymous;
                const submitter =
                  state.homeroomClass.students.find((student) => student.studentId === submission.studentId) ??
                  null;

                return (
                  <article className="activity-row" key={submission.submissionId}>
                    <div>
                      <strong>
                        {isAnonymous
                          ? "익명 제출"
                          : `${submitter?.studentNumber ?? ""} ${getStudentName(submission.studentId)}`.trim()}
                      </strong>
                      <span>{submission.submittedAt.slice(0, 19).replace("T", " ")}</span>
                      <p>{submission.content || (submission.choice === "agree" ? "동의" : "수정 필요")}</p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="icon-button danger"
                        type="button"
                        disabled={isClassArchived}
                        onClick={() => {
                          actions.deleteSubmission(submission.submissionId);
                          setOperationMessage("선택한 제출을 삭제했습니다.");
                        }}
                        aria-label="제출 삭제"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>
        </article>
      </section>
    </div>
  );
}
