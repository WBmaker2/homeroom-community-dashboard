import { GraduationCap, Link2, UserRoundCog } from "lucide-react";
import { useEffect, useState } from "react";
import { createBrowserPath, getAppRoutePath } from "./domain/appRoutes";
import { StudentParticipation } from "./features/student/StudentParticipation";
import { TeacherAccessGate } from "./features/teacher/TeacherAccessGate";
import { TeacherShell } from "./features/teacher/TeacherShell";
import { useHomeroomState } from "./state/useHomeroomState";

type AppRoute =
  | { screen: "entry" }
  | { screen: "teacher" }
  | { screen: "student"; code?: string };

export default function App() {
  const homeroom = useHomeroomState();
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    function handlePopState() {
      setRoute(getCurrentRoute());
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState(null, "", createBrowserPath(path));
    setRoute(getCurrentRoute());
  }

  if (route.screen === "teacher") {
    return (
      <TeacherAccessGate>
        {({ lockTeacher }) => (
          <main className="app-shell">
            <TeacherShell {...homeroom} onLock={lockTeacher} />
          </main>
        )}
      </TeacherAccessGate>
    );
  }

  if (route.screen === "student") {
    return (
      <main className="student-app">
        <StudentParticipation
          initialCode={route.code}
          state={homeroom.state}
          actions={homeroom.actions}
          getStudentName={homeroom.getStudentName}
        />
      </main>
    );
  }

  return (
    <main className="entry-shell">
      <section className="entry-panel">
        <div className="brand-lockup student-brand">
          <div className="brand-mark" aria-hidden="true">
            우
          </div>
          <div>
            <p className="brand-title">오늘 우리 반</p>
            <p className="brand-caption">수업 참여와 학급 운영을 분리해서 시작합니다.</p>
          </div>
        </div>

        <div className="entry-grid">
          <button className="entry-card" type="button" onClick={() => navigate("/teacher")}>
            <UserRoundCog size={24} aria-hidden="true" />
            <strong>교사용 화면</strong>
            <span>학급 설정, 명부, 안건, 백업은 비밀번호 확인 후 열립니다.</span>
          </button>
          <button className="entry-card" type="button" onClick={() => navigate("/student")}>
            <GraduationCap size={24} aria-hidden="true" />
            <strong>학생용 화면</strong>
            <span>참여 코드와 학급 번호로 활동에 제출합니다.</span>
          </button>
        </div>

        <button
          className="secondary-button wide"
          type="button"
          onClick={() => navigate(`/join/${encodeURIComponent(homeroom.state.activities[0]?.code ?? "")}`)}
        >
          <Link2 size={16} aria-hidden="true" />
          샘플 참여 링크 열기
        </button>
      </section>
    </main>
  );
}

function getCurrentRoute(): AppRoute {
  const path = getAppRoutePath();

  if (path === "/teacher") {
    return { screen: "teacher" };
  }

  if (path === "/student") {
    return { screen: "student" };
  }

  if (path.startsWith("/join/")) {
    const code = decodeURIComponent(path.slice("/join/".length));

    return { screen: "student", code };
  }

  return { screen: "entry" };
}
