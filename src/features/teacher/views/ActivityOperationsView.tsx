import { ActivitySquare, Cloud, Copy, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createCloudActivitySnapshot } from "../../../domain/cloudParticipation";
import { createAbsoluteAppUrl } from "../../../domain/appRoutes";
import {
  getActivityAvailability,
  getActivityAvailabilityLabel,
} from "../../../domain/participation";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";
import { getValidTeacherSession, type TeacherSession } from "../../../services/firebaseTeacherAuth";
import {
  deleteCloudSubmission,
  fetchCloudSubmissions,
  getCloudParticipationConfig,
  publishCloudActivity,
} from "../../../services/cloudParticipationClient";

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
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const [teacherSession, setTeacherSession] = useState<TeacherSession | null>(null);
  const cloudConfig = getCloudParticipationConfig();
  const isCloudAuthReady = cloudConfig.enabled && teacherSession !== null;

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const session = await getValidTeacherSession();

      if (mounted) {
        setTeacherSession(session);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  async function publishSelectedActivity() {
    if (!selectedActivity || !cloudConfig.enabled) {
      return;
    }
    if (!teacherSession) {
      setOperationMessage("클라우드 동기화는 교사 로그인 후에만 사용 가능합니다.");
      return;
    }

    setIsCloudBusy(true);

    try {
      await publishCloudActivity(
        createCloudActivitySnapshot({
          teacherId: state.teacherId,
          teacherUid: teacherSession.teacherUid,
          homeroomClass: state.homeroomClass,
          activity: selectedActivity,
          ruleCandidates: state.ruleCandidates,
          publishedAt: new Date().toISOString(),
        }),
        teacherSession.idToken,
      );
      setOperationMessage(`${selectedActivity.code} 활동을 클라우드에 게시했습니다.`);
    } catch {
      setOperationMessage("클라우드 활동 게시에 실패했습니다. Firebase 설정과 보안 규칙을 확인해 주세요.");
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function syncSelectedSubmissions() {
    if (!selectedActivity || !cloudConfig.enabled) {
      return;
    }
    if (!teacherSession) {
      setOperationMessage("클라우드 동기화는 교사 로그인 후에만 사용 가능합니다.");
      return;
    }

    setIsCloudBusy(true);

    try {
      const cloudSubmissions = await fetchCloudSubmissions({
        activity: selectedActivity,
        idToken: teacherSession.idToken,
      });
      const result = actions.importParticipationSubmissions(cloudSubmissions);

      setOperationMessage(
        `클라우드 제출 ${result.addedCount}건을 불러왔습니다. ${result.skippedCount}건은 이미 반영되어 건너뛰었습니다.`,
      );
    } catch {
      setOperationMessage("클라우드 제출을 불러오지 못했습니다. Firebase 설정과 네트워크를 확인해 주세요.");
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function deleteSubmission(submissionId: string) {
    const targetSubmission = selectedSubmissions.find(
      (submission) => submission.submissionId === submissionId,
    );

    if (!targetSubmission || !selectedActivity) {
      return;
    }
    if (!cloudConfig.enabled) {
      actions.deleteSubmission(submissionId);
      setOperationMessage("선택한 제출을 삭제했습니다.");
      return;
    }

    if (!teacherSession?.idToken) {
      setOperationMessage("클라우드 동기화는 교사 로그인 후에만 사용 가능합니다.");
      return;
    }

    try {
      await deleteCloudSubmission({
        activity: selectedActivity,
        submission: targetSubmission,
        idToken: teacherSession.idToken,
      });
    } catch {
      setOperationMessage("클라우드 제출 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    actions.deleteSubmission(submissionId);
    setOperationMessage("선택한 제출을 삭제했습니다.");
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

      <section className="panel cloud-sync-panel">
        <div className="panel-heading compact-heading">
          <div>
            <h2>클라우드 참여 동기화</h2>
            <p>
              {cloudConfig.enabled
                ? "선택 활동을 게시하고 학생 기기에서 들어온 제출을 불러옵니다."
                : cloudConfig.reason}
            </p>
          </div>
          <Cloud size={22} aria-hidden="true" />
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={!isCloudAuthReady || isClassArchived || !selectedActivity || isCloudBusy}
            type="button"
            onClick={publishSelectedActivity}
          >
            <Cloud size={16} aria-hidden="true" />
            선택 활동 게시
          </button>
          <button
            className="secondary-button"
            disabled={!isCloudAuthReady || isClassArchived || !selectedActivity || isCloudBusy}
            type="button"
            onClick={syncSelectedSubmissions}
          >
            <RefreshCw size={16} aria-hidden="true" />
            제출 불러오기
          </button>
          {selectedActivity && (
            <span className="status-chip">선택: {selectedActivity.code}</span>
          )}
        </div>
      </section>

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
                      disabled={isClassArchived || activity.status === "closed"}
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
                        onClick={() => void deleteSubmission(submission.submissionId)}
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
