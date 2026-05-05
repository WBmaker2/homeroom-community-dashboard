import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import {
  STORAGE_KEY,
  createSnapshotPayload,
  parseStoredSnapshot,
  serializeBackup,
  serializeSnapshot,
  type HomeroomDataSnapshot,
} from "../domain/persistence";
import { createAbsoluteAppUrl } from "../domain/appRoutes";
import { TEACHER_SESSION_STORAGE_KEY } from "../services/firebaseTeacherAuth";
import {
  TEACHER_PIN_STORAGE_KEY,
  TEACHER_UNLOCK_STORAGE_KEY,
} from "../features/teacher/TeacherAccessGate";
import * as timePolicy from "../domain/timePolicy";

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
  const opensAt = "2020-01-01T00:00:00+09:00";
  const closesAt = "2099-12-31T18:00:00+09:00";

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
        opensAt,
        closesAt,
        isAnonymous: true,
        allowMultipleSubmissions: false,
      },
    ],
  };
}

function createArchivedParticipationSnapshot(code: string): HomeroomDataSnapshot {
  const snapshot = createStudentParticipationSnapshot(code);

  return {
    ...snapshot,
    homeroomClasses: snapshot.homeroomClasses.map((homeroomClass) => ({
      ...homeroomClass,
      status: "archived",
    })),
  };
}

function createOperationsSnapshot(params: {
  code: string;
  status?: "open" | "closed";
  closesAt?: string;
  opensAt?: string;
  type?: "agendaSubmission" | "ruleVote" | "ruleFeedback" | "praiseReport";
  isAnonymous?: boolean;
  allowMultipleSubmissions?: boolean;
  submissions?: HomeroomDataSnapshot["submissions"];
}): HomeroomDataSnapshot {
  const snapshot = createStudentParticipationSnapshot(params.code);

  return {
    ...snapshot,
    activities: [
      {
        activityId: `activity-${params.code}`,
        classId: snapshot.homeroomClasses[0]!.classId,
        type: params.type ?? "agendaSubmission",
        title: `${params.code} 활동`,
        targetId: params.type === "ruleVote" ? "candidate-test" : undefined,
        code: params.code,
        status: params.status ?? "open",
        opensAt: params.opensAt ?? "2026-05-03T08:00:00+09:00",
        closesAt: params.closesAt ?? "2026-05-03T18:00:00+09:00",
        isAnonymous: params.isAnonymous ?? false,
        allowMultipleSubmissions: params.allowMultipleSubmissions ?? true,
      },
      ...snapshot.activities,
    ],
    submissions: params.submissions ?? snapshot.submissions,
  };
}

describe("homeroom app workflows", () => {
  beforeEach(() => {
    ensureMutableStorage("localStorage");
    ensureMutableStorage("sessionStorage");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("blocks duplicate roster numbers when adding and editing students", async () => {
    const user = userEvent.setup();

    unlockTeacherSession();
    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "학급 설정" }));
    await user.type(screen.getAllByLabelText("학급명")[0]!, "중복 확인 학급");
    await user.click(screen.getByRole("button", { name: "학급 등록" }));

    await user.type(screen.getAllByLabelText("번호")[0]!, "1");
    await user.type(screen.getAllByLabelText("이름")[0]!, "홍길동");
    await user.click(screen.getByRole("button", { name: "학생 등록" }));

    await user.type(screen.getAllByLabelText("번호")[0]!, "01번");
    await user.type(screen.getAllByLabelText("이름")[0]!, "김서연");
    await user.click(screen.getByRole("button", { name: "학생 등록" }));

    expect(screen.getByRole("status").textContent).toContain("이미 사용 중인 학생 번호입니다.");

    await user.clear(screen.getAllByLabelText("번호")[0]!);
    await user.type(screen.getAllByLabelText("번호")[0]!, "2");
    await user.click(screen.getByRole("button", { name: "학생 등록" }));

    const rosterNumberInputs = screen.getAllByLabelText("번호");
    await user.clear(rosterNumberInputs.at(-1)!);
    await user.type(rosterNumberInputs.at(-1)!, "1");
    await user.click(screen.getAllByRole("button", { name: "저장" }).at(-1)!);

    expect(screen.getByRole("status").textContent).toContain("이미 사용 중인 학생 번호입니다.");
  });

  it("previews and imports pasted roster rows while skipping invalid rows", async () => {
    const user = userEvent.setup();

    unlockTeacherSession();
    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "학급 설정" }));
    await user.type(screen.getAllByLabelText("학급명")[0]!, "일괄 등록 학급");
    await user.click(screen.getByRole("button", { name: "학급 등록" }));

    await user.type(screen.getAllByLabelText("번호")[0]!, "1");
    await user.type(screen.getAllByLabelText("이름")[0]!, "기존학생");
    await user.click(screen.getByRole("button", { name: "학생 등록" }));

    await user.type(
      screen.getByLabelText("붙여넣기 명단"),
      ["번호,이름,표시명", "1,중복학생,중복", "2 홍길동 길동", "03,김서연,서연", "4"].join("\n"),
    );
    await user.click(screen.getByRole("button", { name: "미리보기" }));

    expect(screen.getByRole("status").textContent).toContain("등록 가능 2명");
    expect(screen.getByText("등록 가능").nextElementSibling?.textContent).toBe("2명");
    expect(screen.getByText("확인 필요").nextElementSibling?.textContent).toBe("2건");
    expect(screen.getByText(/이미 사용 중인 학생 번호입니다/)).toBeInTheDocument();
    expect(screen.getByText(/학생 이름이 비어 있습니다/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "등록 실행" }));

    expect(screen.getByRole("status").textContent).toContain("2명을 등록했습니다. 2건은 건너뛰었습니다.");
    expect(screen.getAllByText("3명").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("길동")).toBeInTheDocument();
    expect(screen.getByDisplayValue("서연")).toBeInTheDocument();
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

  it("keeps archived classes read-only in teacher tools", async () => {
    const user = userEvent.setup();
    const archivedCode = "ARCH-TEST-0000";

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createArchivedParticipationSnapshot(archivedCode),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");

    expect(screen.getByText(/보관 학급은/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학생 링크 복사" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "회의 안건" }));
    expect(screen.getByRole("button", { name: "안건 제출 열기" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    const archivedActivityCopy = getActivityActionButton(archivedCode, `${archivedCode} 링크 복사`);
    const archivedActivityClose = getActivityActionButton(archivedCode, `${archivedCode} 종료`);
    const archivedActivityReopen = getActivityActionButton(archivedCode, `${archivedCode} 다시 열기`);

    expect(archivedActivityCopy).toBeDisabled();
    expect(archivedActivityClose).toBeDisabled();
    expect(archivedActivityReopen).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "학급 설정" }));
    expect(screen.getByRole("button", { name: "학생 등록" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "미리보기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "등록 실행" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "저장" }).at(-1)!).toBeDisabled();
  });

  it("copies exact join links per activity from activity operations", async () => {
    const user = userEvent.setup();
    const activityCode = "COPY-JOIN-0001";

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: activityCode,
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton(activityCode));
    await user.click(getActivityActionButton(activityCode, `${activityCode} 링크 복사`));

    expect(writeTextSpy).toHaveBeenCalledWith(createAbsoluteAppUrl(`/join/${activityCode}`));
    expect(screen.getByRole("status").textContent).toContain(`${activityCode} 링크를 복사했습니다.`);
  });

  it("aligns teacher open-activity indicators with starts and closes", async () => {
    const user = userEvent.setup();
    const fixedNow = "2026-05-05T10:00:00+09:00";
    const snapshot = createBackupSnapshot("시간 제약 학급");

    snapshot.activities = [
      {
        activityId: "activity-expired",
        classId: snapshot.homeroomClasses[0]!.classId,
        type: "agendaSubmission",
        title: "만료된 활동",
        code: "EXPIRED-0001",
        status: "open",
        opensAt: "2026-05-04T09:00:00+09:00",
        closesAt: "2026-05-05T09:00:00+09:00",
        isAnonymous: false,
        allowMultipleSubmissions: true,
      },
      {
        activityId: "activity-upcoming",
        classId: snapshot.homeroomClasses[0]!.classId,
        type: "agendaSubmission",
        title: "시작 전 활동",
        code: "UPCOMING-0001",
        status: "open",
        opensAt: "2026-05-06T09:00:00+09:00",
        closesAt: "2026-05-06T18:00:00+09:00",
        isAnonymous: false,
        allowMultipleSubmissions: true,
      },
    ];

    const nowSpy = vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(fixedNow);

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot,
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");
    expect(screen.getByText("0개 열림")).toBeInTheDocument();
    expect(screen.queryByText("만료된 활동")).not.toBeInTheDocument();
    expect(screen.queryByText("시작 전 활동")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "회의 안건" }));
    expect(screen.getByText("마감됨")).toBeInTheDocument();
    expect(screen.getByText("시작 전")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    const expiredRow = getActivityRowButton("EXPIRED-0001");
    const upcomingRow = getActivityRowButton("UPCOMING-0001");

    expect(within(expiredRow.closest("article")!).getByText("상태: 마감됨")).toBeInTheDocument();
    expect(within(upcomingRow.closest("article")!).getByText("상태: 시작 전")).toBeInTheDocument();
    expect(getActivityActionButton("EXPIRED-0001", "EXPIRED-0001 종료")).toBeEnabled();
    expect(getActivityActionButton("UPCOMING-0001", "UPCOMING-0001 종료")).toBeEnabled();

    nowSpy.mockRestore();
  });

  it("disables student submission after closing an activity and re-enables it after reopening", async () => {
    const user = userEvent.setup();
    const activityCode = "CLOSE-REOPEN-0001";
    const fixedNow = "2026-05-03T10:00:00+09:00";

    const nowSpy = vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(fixedNow);

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: activityCode,
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton(activityCode));
    await user.click(getActivityActionButton(activityCode, `${activityCode} 종료`));

    navigateTo(`/join/${activityCode}`);

    await user.type(screen.getByLabelText("학급 번호"), "1");
    await user.type(screen.getByLabelText("안건"), "마감 후 제출 시도");
    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();

    navigateTo("/teacher");

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton(activityCode));
    await user.click(getActivityActionButton(activityCode, `${activityCode} 다시 열기`));

    navigateTo(`/join/${activityCode}`);

    await waitFor(() => expect(screen.getByRole("button", { name: "제출" })).toBeEnabled());
    await user.clear(screen.getByLabelText("학급 번호"));
    await user.type(screen.getByLabelText("학급 번호"), "1");
    await user.type(screen.getByLabelText("안건"), "재오픈 후 제출");
    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(screen.getByRole("status").textContent).toContain("제출되었습니다.");

    nowSpy.mockRestore();
  });

  it("rolls back vote counts when deleting a ruleVote submission", async () => {
    const user = userEvent.setup();
    const fixedNow = "2026-05-03T10:00:00+09:00";
    const activityCode = "VOTE-DELETE-0001";
    const candidateId = "vote-candidate-rollback";
    const snapshot = createBackupSnapshot("투표 삭제 학급");

    snapshot.activities = [
      {
        activityId: "activity-vote-delete",
        classId: snapshot.homeroomClasses[0]!.classId,
        type: "ruleVote",
        title: "투표 삭제 검증 활동",
        targetId: candidateId,
        code: activityCode,
        status: "open",
        opensAt: "2026-05-03T09:00:00+09:00",
        closesAt: "2026-05-03T18:00:00+09:00",
        isAnonymous: false,
        allowMultipleSubmissions: false,
      },
    ];

    snapshot.ruleCandidates = [
      {
        ruleCandidateId: candidateId,
        classId: snapshot.homeroomClasses[0]!.classId,
        title: "테스트 규칙 후보",
        description: "삭제 시 카운트 검증용",
        status: "VOTING",
        voteEndsAt: "2026-05-03T18:00:00+09:00",
        votes: {
          agree: 1,
          needsRevision: 0,
        },
      },
    ];

    snapshot.submissions = [
      {
        submissionId: "submission-vote-delete",
        classId: snapshot.homeroomClasses[0]!.classId,
        activityId: "activity-vote-delete",
        studentId: "student-imported-01",
        submittedAt: fixedNow,
        choice: "agree",
      },
    ];

    vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(fixedNow);
    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot,
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton(activityCode));
    await user.click(screen.getByRole("button", { name: "제출 삭제" }));

    await waitFor(() => {
      expect(
        getPersistedSnapshot().ruleCandidates.find((candidate) => candidate.ruleCandidateId === candidateId)
          ?.votes.agree,
      ).toBe(0);
    });
  });

  it("allows one-time re-submission after deleting submission record", async () => {
    const user = userEvent.setup();
    const activityCode = "DELETE-RESUBMIT-0001";
    const fixedNow = "2026-05-03T10:00:00+09:00";

    const nowSpy = vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(fixedNow);

    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: activityCode,
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: false,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt(`/join/${activityCode}`);

    await user.type(screen.getByLabelText("학급 번호"), "1");
    await user.type(screen.getByLabelText("안건"), "첫 번째 제출");
    await user.click(screen.getByRole("button", { name: "제출" }));
    expect(screen.getByRole("status").textContent).toContain("제출되었습니다.");

    unlockTeacherSession();
    navigateTo("/teacher");

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton(activityCode));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "제출 삭제" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "제출 삭제" }));

    navigateTo(`/join/${activityCode}`);

    await user.clear(screen.getByLabelText("학급 번호"));
    await user.type(screen.getByLabelText("학급 번호"), "1");
    await user.clear(screen.getByLabelText("안건"));
    await user.type(screen.getByLabelText("안건"), "두 번째 제출");
    await user.click(screen.getByRole("button", { name: "제출" }));

    expect(screen.getByRole("status").textContent).toContain("제출되었습니다.");

    nowSpy.mockRestore();
  });

  it("hides student identity for anonymous submissions in operations view", async () => {
    const user = userEvent.setup();
    const activityCode = "ANON-OPS-0001";
    const classId = "class-imported";
    const activityId = `activity-${activityCode}`;

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: activityCode,
            type: "agendaSubmission",
            isAnonymous: true,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
            submissions: [
              {
                submissionId: "submission-anon-01",
                classId,
                activityId,
                studentId: "student-imported-01",
                submittedAt: "2026-05-03T10:00:00+09:00",
                content: "익명으로 남깁니다",
              },
            ],
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");

    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton(activityCode));

    expect(screen.getByText("익명 제출")).toBeInTheDocument();
    expect(screen.queryByText("1 길동")).not.toBeInTheDocument();
  });

  it("blocks student submissions for archived classes", () => {
    const archivedCode = "ARCH-TEST-0000";

    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createArchivedParticipationSnapshot(archivedCode),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt(`/join/${archivedCode}`);

    expect(screen.getByText(/보관된 학급 활동입니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();
  });

  it("keeps existing activity/candidate/rule dates when loading from existing storage", async () => {
    const fixedNow = "2026-05-04T10:00:00+09:00";
    const legacyActivityClosesAt = "2025-05-01T18:00:00+09:00";
    const legacyVoteEndsAt = "2025-05-01T18:00:00+09:00";
    const legacyRuleCheckDate = "2025-05-05T09:00:00+09:00";
    const savedSnapshot = createDateSeededSnapshot({
      activityClosesAt: legacyActivityClosesAt,
      ruleCandidateVoteEndsAt: legacyVoteEndsAt,
      ruleCheckDate: legacyRuleCheckDate,
    });

    vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(fixedNow);

    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: savedSnapshot,
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    unlockTeacherSession();
    renderAt("/teacher");

    await waitFor(() => {
      const persisted = getPersistedSnapshot();

      expect(persisted.activities[0]?.closesAt).toBe(legacyActivityClosesAt);
      expect(persisted.ruleCandidates[0]?.voteEndsAt).toBe(legacyVoteEndsAt);
      expect(persisted.classroomRules[0]?.checkDate).toBe(legacyRuleCheckDate);
    });
  });

  it("adjusts fresh sample dates to policy windows on first run", async () => {
    const fixedNow = "2026-05-04T10:00:00+09:00";
    vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(fixedNow);

    const expectedVoteClosesAt = timePolicy.createDefaultVoteClosesAt(fixedNow);
    const expectedRuleCheckDate = timePolicy.createDefaultRuleCheckDate(fixedNow);

    unlockTeacherSession();
    renderAt("/teacher");

    await waitFor(() => {
      const persisted = getPersistedSnapshot();

      expect(
        persisted.activities.find((activity) => activity.type === "ruleVote")?.closesAt,
      ).toBe(expectedVoteClosesAt);
      expect(
        persisted.ruleCandidates.find((candidate) => candidate.voteEndsAt)?.voteEndsAt,
      ).toBe(expectedVoteClosesAt);
      expect(
        persisted.classroomRules.find((rule) => rule.checkDate)?.checkDate,
      ).toBe(expectedRuleCheckDate);
    });
  });

  it("creates policy-aligned deadlines when teacher opens agenda, vote, and confirms rules", async () => {
    const user = userEvent.setup();
    const screenOpenedAt = "2026-05-04T10:00:00+09:00";
    const confirmedAt = "2026-05-05T10:00:00+09:00";
    const expectedAgendaClosesAt = timePolicy.createDefaultAgendaClosesAt(screenOpenedAt);
    const expectedVoteClosesAt = timePolicy.createDefaultVoteClosesAt(screenOpenedAt);
    const initialRuleCheckDate = timePolicy.createDefaultRuleCheckDate(screenOpenedAt);
    const expectedConfirmedRuleCheckDate = timePolicy.createDefaultRuleCheckDate(confirmedAt);

    const nowSpy = vi.spyOn(timePolicy, "getCurrentHomeroomIso").mockReturnValue(screenOpenedAt);

    unlockTeacherSession();
    renderAt("/teacher");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "회의 안건" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "회의 안건" }));
    await user.click(screen.getByRole("button", { name: "안건 제출 열기" }));

    await waitFor(() => {
      const persisted = getPersistedSnapshot();
      const agendaSubmission = persisted.activities.find(
        (activity) => activity.type === "agendaSubmission",
      );

      expect(agendaSubmission?.closesAt).toBe(expectedAgendaClosesAt);
    });

    const beforeVoteCount = getPersistedSnapshot().activities.filter(
      (activity) => activity.type === "ruleVote",
    ).length;
    await user.click(screen.getByRole("button", { name: "규칙 합의" }));

    const ruleDateInput = screen.getByLabelText("점검일");
    expect(ruleDateInput).toHaveValue(initialRuleCheckDate);

    await user.click(screen.getByRole("button", { name: "투표 열기" }));

    await waitFor(() => {
      const persisted = getPersistedSnapshot();

      expect(
        persisted.activities.filter((activity) => activity.type === "ruleVote").length,
      ).toBe(beforeVoteCount + 1);
      expect(persisted.activities.find((activity) => activity.type === "ruleVote")?.closesAt).toBe(
        expectedVoteClosesAt,
      );
    });

    await user.click(screen.getByRole("button", { name: "투표 종료" }));
    nowSpy.mockReturnValue(confirmedAt);
    await user.click(screen.getByRole("button", { name: "확정" }));

    await waitFor(() => {
      const persisted = getPersistedSnapshot();

      expect(persisted.classroomRules[0]?.checkDate).toBe(expectedConfirmedRuleCheckDate);
      expect(persisted.classroomRules[0]?.title).toBe("모둠 활동 시작 전 역할 확인하기");
    });
  });

  it("shows teacher login form when cloud is enabled but no teacher session exists", async () => {
    const user = userEvent.setup();

    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "homeroom-test-project");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key-123");
    vi.spyOn(globalThis, "fetch");

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: "CLOUD-NOSESSION-0001",
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");
    await user.click(screen.getByRole("button", { name: "활동 운영" }));

    expect(screen.getByLabelText("교사 이메일")).toBeInTheDocument();
    expect(screen.getByLabelText("교사 비밀번호")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "교사 로그인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "선택 활동 게시" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
  });

  it("allows teacher login and enables cloud controls with real session persistence", async () => {
    const user = userEvent.setup();
    const signInResponse = {
      localId: "teacher-uid-001",
      email: "teacher@example.com",
      idToken: "id-token-001",
      refreshToken: "refresh-token-001",
      expiresIn: "3600",
    };

    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "homeroom-test-project");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key-123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(signInResponse), { status: 200 }),
    );

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: "CLOUD-LOGIN-0001",
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");
    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.type(screen.getByLabelText("교사 이메일"), "teacher@example.com");
    await user.type(screen.getByLabelText("교사 비밀번호"), "teacher-password");

    await user.click(screen.getByRole("button", { name: "교사 로그인" }));

    await waitFor(() => {
      expect(
        screen.getByRole("status"),
      ).toHaveTextContent("teacher@example.com 교사 로그인이 완료되었습니다.");
      expect(screen.getByText("로그인: teacher@example.com")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "선택 활동 게시" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "제출 불러오기" })).toBeEnabled();
    });

    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(window.localStorage.getItem(TEACHER_SESSION_STORAGE_KEY)).toContain("teacher-uid-001");

    const signInCall = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(signInCall?.[0]).toBe(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=api-key-123",
    );
  });

  it("logs out teacher session and returns to login form", async () => {
    const user = userEvent.setup();

    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "homeroom-test-project");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key-123");
    vi.spyOn(globalThis, "fetch");

    window.localStorage.setItem(
      TEACHER_SESSION_STORAGE_KEY,
      JSON.stringify({
        teacherUid: "teacher-uid-001",
        email: "teacher@example.com",
        idToken: "id-token-001",
        refreshToken: "refresh-token-001",
        expiresAt: Date.now() + 3600_000,
      }),
    );

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: "CLOUD-LOGOUT-0001",
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");
    await user.click(screen.getByRole("button", { name: "활동 운영" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(screen.getByRole("button", { name: "교사 로그인" })).toBeInTheDocument();
    expect(screen.getByLabelText("교사 이메일")).toBeInTheDocument();
    expect(window.localStorage.getItem(TEACHER_SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "선택 활동 게시" })).toBeDisabled();
  });

  it("keeps local submission deletion working when cloud config is disabled", async () => {
    const user = userEvent.setup();

    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: "LOCAL-DEL-0001",
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
            submissions: [
              {
                submissionId: "submission-local-delete",
                classId: "class-imported",
                activityId: `activity-LOCAL-DEL-0001`,
                studentId: "student-imported-01",
                submittedAt: "2026-05-03T10:00:00+09:00",
                content: "로컬 삭제 테스트",
              },
            ],
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );
    vi.spyOn(globalThis, "fetch");

    renderAt("/teacher");
    await user.click(screen.getByRole("button", { name: "활동 운영" }));
    await user.click(getActivityRowButton("LOCAL-DEL-0001"));
    await user.click(screen.getByRole("button", { name: "제출 삭제" }));

    expect(screen.getByRole("status").textContent).toContain("선택한 제출을 삭제했습니다.");
    expect(screen.queryByText("로컬 삭제 테스트")).not.toBeInTheDocument();
    expect(screen.getAllByText("제출 기록이 없습니다.").length).toBeGreaterThan(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not show teacher login UI when Firebase auth config is unavailable", async () => {
    const user = userEvent.setup();

    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.spyOn(globalThis, "fetch");

    unlockTeacherSession();
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(
        createSnapshotPayload({
          snapshot: createOperationsSnapshot({
            code: "LOCAL-NOCLOUD-0001",
            type: "agendaSubmission",
            isAnonymous: false,
            allowMultipleSubmissions: true,
            opensAt: "2026-05-03T09:00:00+09:00",
            closesAt: "2026-05-03T18:00:00+09:00",
          }),
          savedAt: "2026-05-03T09:00:00.000Z",
        }),
      ),
    );

    renderAt("/teacher");
    await user.click(screen.getByRole("button", { name: "활동 운영" }));

    expect(screen.queryByLabelText("교사 이메일")).not.toBeInTheDocument();
    expect(
      screen.getByText("Firebase 환경변수가 없어 로컬 모드로 동작합니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 활동 게시" })).toBeDisabled();
  });
});

function renderAt(path: string) {
  window.history.pushState(null, "", path);

  return render(<App />);
}

function navigateTo(path: string) {
  act(() => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function ensureMutableStorage(storageKey: "localStorage" | "sessionStorage") {
  const storage = window[storageKey];

  if (typeof storage?.clear === "function") {
    return;
  }

  const values = new Map<string, string>();
  const replacement = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  } satisfies Storage;

  Object.defineProperty(window, storageKey, {
    configurable: true,
    value: replacement,
  });
}

function getActivityRowButton(activityCode: string) {
  const escapedCode = activityCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowButton = screen
    .getAllByRole("button", { name: new RegExp(escapedCode) })
    .find((button) => button.classList.contains("text-button"));

  if (!rowButton) {
    throw new Error(`활동 ${activityCode} 행을 찾을 수 없습니다.`);
  }

  return rowButton;
}

function getActivityActionButton(activityCode: string, actionLabel: string) {
  const rowButton = getActivityRowButton(activityCode);
  const rowArticle = rowButton.closest("article");

  if (!rowArticle) {
    throw new Error(`활동 ${activityCode} 행을 찾을 수 없습니다.`);
  }

  return within(rowArticle).getByRole("button", { name: actionLabel });
}

function unlockTeacherSession() {
  window.localStorage.setItem(TEACHER_PIN_STORAGE_KEY, "1234");
  window.sessionStorage.setItem(TEACHER_UNLOCK_STORAGE_KEY, "true");
}

function createDateSeededSnapshot(params: {
  activityClosesAt: string;
  ruleCandidateVoteEndsAt: string;
  ruleCheckDate: string;
}): HomeroomDataSnapshot {
  const seed = createBackupSnapshot("저장된 학급");
  const classId = seed.homeroomClasses[0]?.classId ?? "class-imported";

  return {
    ...seed,
    activities: [
      {
        activityId: "activity-vote-saved",
        classId,
        type: "ruleVote",
        title: "기존 저장 투표",
        targetId: "saved-candidate",
        code: "SAVE-VOTE-0000",
        status: "open",
        opensAt: "2026-01-01T09:00:00+09:00",
        closesAt: params.activityClosesAt,
        isAnonymous: true,
        allowMultipleSubmissions: false,
      },
    ],
    ruleCandidates: [
      {
        ruleCandidateId: "candidate-saved",
        classId,
        title: "기존 규칙 후보",
        description: "테스트용 규칙 후보",
        status: "VOTING",
        voteEndsAt: params.ruleCandidateVoteEndsAt,
        votes: {
          agree: 0,
          needsRevision: 0,
        },
      },
    ],
    classroomRules: [
      {
        ruleId: "rule-saved",
        classId,
        title: "기존 교실 약속",
        description: "테스트용 약속",
        checkDate: params.ruleCheckDate,
        status: "active",
      },
    ],
  };
}

function getPersistedSnapshot() {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  expect(raw).not.toBeNull();

  const parsed = parseStoredSnapshot(raw!);

  expect(parsed.ok).toBe(true);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.snapshot;
}
