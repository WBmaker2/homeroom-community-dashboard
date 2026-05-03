import { ArrowRight, CalendarClock, CheckCircle2 } from "lucide-react";
import type { computeDashboardSignals } from "../../../domain/dashboardSignals";
import type { recommendSeatingPlan } from "../../../domain/seating";
import type { ParticipationActivity } from "../../../domain/types";
import type { ActiveView } from "../TeacherShell";

type DashboardViewProps = {
  signals: ReturnType<typeof computeDashboardSignals>;
  seatingPlan: ReturnType<typeof recommendSeatingPlan>;
  activities: ParticipationActivity[];
  setActiveView: (view: ActiveView) => void;
};

export function DashboardView({
  signals,
  seatingPlan,
  activities,
  setActiveView,
}: DashboardViewProps) {
  const openActivities = activities.filter((activity) => activity.status === "open");

  return (
    <div className="view-stack">
      <section className="signal-grid" aria-label="오늘 확인할 신호">
        <SignalCard label="새 안건" value={`${signals.newAgendaCount}건`} />
        <SignalCard label="마감 임박 투표" value={`${signals.voteEndingSoonCount}건`} />
        <SignalCard label="칭찬 공백" value={`${signals.praiseGapStudents.length}명`} />
        <SignalCard label="자리 조건 충돌" value={`${seatingPlan.conflicts.length}건`} />
        <SignalCard label="점검할 약속" value={`${signals.rulesDueSoon.length}개`} />
      </section>

      <section className="two-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>오늘 먼저 볼 항목</h2>
              <p>승인 전 학생 제출과 교사용 운영 메모를 분리해 요약했습니다.</p>
            </div>
            <CalendarClock size={22} aria-hidden="true" />
          </div>

          <div className="task-list">
            <TaskRow
              title="회의 안건 검토"
              detail={`검토 대기 안건 ${signals.newAgendaCount}건을 회의용 문장으로 다듬어 주세요.`}
              onClick={() => setActiveView("agenda")}
            />
            <TaskRow
              title="칭찬 공백 확인"
              detail={
                signals.praiseGapStudents.length > 0
                  ? `${signals.praiseGapStudents
                      .slice(0, 3)
                      .map((student) => student.displayName)
                      .join(", ")} 학생의 긍정 기록을 살펴보세요.`
                  : "최근 칭찬 공백 학생이 없습니다."
              }
              onClick={() => setActiveView("praise")}
            />
            <TaskRow
              title="학급 약속 점검"
              detail={signals.rulesDueSoon[0]?.title ?? "가까운 점검일의 약속이 없습니다."}
              onClick={() => setActiveView("rules")}
            />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>열린 참여 활동</h2>
              <p>학생은 코드와 번호로만 참여합니다.</p>
            </div>
            <span className="status-chip">{openActivities.length}개 열림</span>
          </div>

          <div className="activity-stack">
            {openActivities.map((activity) => (
              <div className="activity-row" key={activity.activityId}>
                <div>
                  <strong>{activity.title}</strong>
                  <span>{activity.code}</span>
                </div>
                <small>{activity.isAnonymous ? "익명" : "기명"}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function SignalCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="signal-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function TaskRow({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="task-row task-button" type="button" onClick={onClick}>
      <CheckCircle2 size={18} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}
