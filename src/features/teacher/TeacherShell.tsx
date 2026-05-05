import {
  CheckCircle2,
  ClipboardList,
  Copy,
  ListTodo,
  HandHeart,
  LayoutDashboard,
  Lock,
  School,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { createAbsoluteAppUrl } from "../../domain/appRoutes";
import { formatKoreanDateLabel } from "../../domain/timePolicy";
import type { computeDashboardSignals } from "../../domain/dashboardSignals";
import type { recommendSeatingPlan } from "../../domain/seating";
import type { HomeroomActions, HomeroomState } from "../../state/useHomeroomState";
import { AgendaView } from "./views/AgendaView";
import { DashboardView } from "./views/DashboardView";
import { ActivityOperationsView } from "./views/ActivityOperationsView";
import { PraiseView } from "./views/PraiseView";
import { RulesView } from "./views/RulesView";
import { SeatingView } from "./views/SeatingView";
import { SettingsView } from "./views/SettingsView";

const navItems = [
  { id: "dashboard", label: "오늘 신호", icon: LayoutDashboard },
  { id: "seating", label: "자리 배치", icon: School },
  { id: "praise", label: "칭찬 기록", icon: HandHeart },
  { id: "agenda", label: "회의 안건", icon: ClipboardList },
  { id: "rules", label: "규칙 합의", icon: CheckCircle2 },
  { id: "activityOperations", label: "활동 운영", icon: ListTodo },
  { id: "settings", label: "학급 설정", icon: Settings },
] as const;

export type ActiveView = (typeof navItems)[number]["id"];

type TeacherShellProps = {
  state: HomeroomState;
  actions: HomeroomActions;
  seatingPlan: ReturnType<typeof recommendSeatingPlan>;
  signals: ReturnType<typeof computeDashboardSignals>;
  getStudentName: (studentId: string) => string;
  onLock: () => void;
};

export function TeacherShell({
  state,
  actions,
  seatingPlan,
  signals,
  getStudentName,
  onLock,
}: TeacherShellProps) {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [shareMessage, setShareMessage] = useState("");
  const isClassArchived = state.homeroomClass.status === "archived";
  const studentLink = createStudentLink();

  async function copyStudentLink() {
    try {
      await navigator.clipboard.writeText(studentLink);
      setShareMessage("학생 참여 링크를 복사했습니다.");
    } catch {
      setShareMessage(studentLink);
    }
  }

  return (
    <>
      <aside className="sidebar" aria-label="교사용 주요 기능">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            우
          </div>
          <div>
            <p className="brand-title">오늘 우리 반</p>
            <p className="brand-caption">{state.homeroomClass.name}</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                className={activeView === item.id ? "nav-item active" : "nav-item"}
                type="button"
                onClick={() => setActiveView(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="date-label">{formatKoreanDateLabel(state.todayIso)}</p>
            <h1>담임 하루 운영 대시보드</h1>
          </div>
          <div className="header-actions">
            <div className="class-pill">
              <Users size={16} aria-hidden="true" />
              <span>{state.homeroomClass.students.length}명</span>
            </div>
            <button
              className="secondary-button"
              disabled={isClassArchived}
              type="button"
              onClick={copyStudentLink}
            >
              <Copy size={16} aria-hidden="true" />
              학생 링크 복사
            </button>
            <button className="secondary-button" type="button" onClick={onLock}>
              <Lock size={16} aria-hidden="true" />
              잠그기
            </button>
          </div>
        </header>

        {shareMessage && (
          <p className="link-status" role="status">
            {shareMessage}
          </p>
        )}

        {isClassArchived && (
          <p className="archive-notice" role="status">
            보관 학급은 읽기 전용입니다. 다시 운영하려면 학급 설정에서 상태를 운영 중으로
            바꿔 주세요.
          </p>
        )}

        {activeView === "dashboard" && (
          <DashboardView
            signals={signals}
            seatingPlan={seatingPlan}
            activities={state.activities}
            setActiveView={setActiveView}
          />
        )}
        {activeView === "seating" && (
          <SeatingView
            state={state}
            actions={actions}
            seatingPlan={seatingPlan}
            getStudentName={getStudentName}
          />
        )}
        {activeView === "praise" && (
          <PraiseView
            state={state}
            actions={actions}
            signals={signals}
            getStudentName={getStudentName}
          />
        )}
        {activeView === "agenda" && (
          <AgendaView state={state} actions={actions} getStudentName={getStudentName} />
        )}
        {activeView === "activityOperations" && (
          <ActivityOperationsView
            state={state}
            actions={actions}
            getStudentName={getStudentName}
          />
        )}
        {activeView === "rules" && <RulesView state={state} actions={actions} />}
        {activeView === "settings" && <SettingsView state={state} actions={actions} />}
      </section>
    </>
  );
}

function createStudentLink(code?: string): string {
  return code ? createAbsoluteAppUrl(`/join/${encodeURIComponent(code)}`) : createAbsoluteAppUrl("/student");
}
