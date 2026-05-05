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
                studentId: "s01",
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
    expect(screen.queryByText("민준")).not.toBeInTheDocument();
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
