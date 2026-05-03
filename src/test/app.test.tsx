import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import {
  STORAGE_KEY,
  createSnapshotPayload,
  serializeBackup,
  serializeSnapshot,
  type HomeroomDataSnapshot,
} from "../domain/persistence";
import {
  TEACHER_PIN_STORAGE_KEY,
  TEACHER_UNLOCK_STORAGE_KEY,
} from "../features/teacher/TeacherAccessGate";

function createBackupSnapshot(className = "복원 학급"): HomeroomDataSnapshot {
  return {
    teacherId: "T-ABCDEFGH",
    homeroomClasses: [
      {
        classId: "class-imported",
        name: className,
        gradeBand: "elementary",
        status: "active",
        students: [
          {
            studentId: "student-imported-01",
            studentNumber: "1",
            name: "홍길동",
            displayName: "길동",
          },
        ],
      },
    ],
    activeClassId: "class-imported",
    praiseRecords: [],
    agendaItems: [],
    ruleCandidates: [],
    classroomRules: [],
    activities: [],
    submissions: [],
    classSeatMaps: {
      "class-imported": {
        rows: 4,
        columns: 4,
        disabledSeatIds: [],
        fixedAssignments: [],
      },
    },
    classSeatingConstraints: {
      "class-imported": [],
    },
    classManualAssignments: {
      "class-imported": [],
    },
  };
}

function createStudentParticipationSnapshot(code = "JOIN-TEST-2345"): HomeroomDataSnapshot {
  const snapshot = createBackupSnapshot("학생 참여 학급");

  return {
    ...snapshot,
    activities: [
      {
        activityId: "activity-test",
        classId: "class-imported",
        type: "ruleVote",
        title: "테스트 투표",
        code,
        status: "open",
        opensAt: "2026-05-03T08:00:00+09:00",
        closesAt: "2026-05-03T18:00:00+09:00",
        isAnonymous: true,
        allowMultipleSubmissions: false,
      },
    ],
  };
}

describe("homeroom app workflows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/");
  });

  it("keeps the student route separated from teacher controls", async () => {
    const user = userEvent.setup();
    const activityCode = "JOIN-TEST-2345";

    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createStudentParticipationSnapshot(activityCode),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt(`/join/${activityCode}`);

    expect(screen.queryByRole("button", { name: "교사용" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "학급 설정" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("학급 번호"), "1");
    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(screen.getByRole("status").textContent).toContain("제출되었습니다.");

    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(screen.getByRole("status").textContent).toContain("이미 참여했습니다.");
  });

  it("lets a teacher create a class and manage the student roster", async () => {
    const user = userEvent.setup();

    unlockTeacherSession();
    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "학급 설정" }));
    await user.type(screen.getAllByLabelText("학급명")[0]!, "5학년 3반");
    await user.click(screen.getByRole("button", { name: "학급 등록" }));

    expect(screen.getByRole("status").textContent).toContain("새 학급을 등록했습니다.");
    expect(screen.getAllByText("0명").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("번호"), "1");
    await user.type(screen.getByLabelText("이름"), "홍길동");
    await user.type(screen.getByLabelText("표시명"), "길동");
    await user.click(screen.getByRole("button", { name: "학생 등록" }));

    expect(screen.getByRole("status").textContent).toContain("학생을 등록했습니다.");
    expect(screen.getAllByText("1명").length).toBeGreaterThan(0);

    const displayNameInputs = screen.getAllByLabelText("표시명");
    await user.clear(displayNameInputs.at(-1)!);
    await user.type(displayNameInputs.at(-1)!, "동이");
    await user.click(screen.getAllByRole("button", { name: "저장" }).at(-1)!);

    expect(screen.getByDisplayValue("동이")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);

    expect(screen.getByRole("status").textContent).toContain("학생을 삭제했습니다.");
    expect(screen.getAllByText("0명").length).toBeGreaterThan(0);
  });

  it("blocks deleting the final remaining class", async () => {
    const user = userEvent.setup();

    unlockTeacherSession();
    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "학급 설정" }));
    await user.click(screen.getAllByRole("button", { name: "삭제" })[0]!);

    expect(screen.getByRole("status").textContent).toContain("마지막 학급은 삭제할 수 없습니다.");
  });

  it("restores a saved snapshot from localStorage on startup", () => {
    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createBackupSnapshot("저장된 학급"),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");

    expect(screen.getByText("저장된 학급")).toBeInTheDocument();
    expect(screen.getAllByText("1명").length).toBeGreaterThan(0);
  });

  it("imports a JSON backup after preview and explicit confirmation", async () => {
    const user = userEvent.setup();
    unlockTeacherSession();
    const backupFile = new File(
      [
        serializeBackup(
          createSnapshotPayload({
            snapshot: createBackupSnapshot("가져온 학급"),
            exportedAt: "2026-05-03T09:30:00.000Z",
          }),
        ),
      ],
      "backup.json",
      { type: "application/json" },
    );

    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "학급 설정" }));
    await user.upload(screen.getByLabelText("JSON 백업 파일"), backupFile);

    expect(await screen.findByText("backup.json")).toBeInTheDocument();

    const importButton = screen.getByRole("button", { name: "가져오기 실행" });

    expect(importButton).toBeDisabled();

    await user.click(screen.getByLabelText("현재 데이터를 백업 파일로 교체합니다."));
    await user.click(importButton);

    expect(screen.getAllByText("가져온 학급").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toContain("백업 데이터를 가져왔습니다.");
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("가져온 학급");
    });
  });

  it("requires teacher pin setup before rendering teacher tools", async () => {
    const user = userEvent.setup();

    renderAt("/teacher");

    expect(screen.getByRole("heading", { name: "교사용 비밀번호 설정" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "학급 설정" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("교사용 비밀번호"), "1234");
    await user.type(screen.getByLabelText("비밀번호 확인"), "1234");
    await user.click(screen.getByRole("button", { name: "설정하고 열기" }));

    expect(screen.getByRole("button", { name: "학급 설정" })).toBeInTheDocument();
    expect(window.localStorage.getItem(TEACHER_PIN_STORAGE_KEY)).toBe("1234");
    expect(window.sessionStorage.getItem(TEACHER_UNLOCK_STORAGE_KEY)).toBe("true");
  });
});

function renderAt(path: string) {
  window.history.pushState(null, "", path);

  return render(<App />);
}

function unlockTeacherSession() {
  window.localStorage.setItem(TEACHER_PIN_STORAGE_KEY, "1234");
  window.sessionStorage.setItem(TEACHER_UNLOCK_STORAGE_KEY, "true");
}
