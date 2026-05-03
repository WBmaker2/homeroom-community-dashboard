import { describe, expect, it } from "vitest";
import {
  APP_ID,
  SCHEMA_VERSION,
  createSnapshotPayload,
  getBackupFileName,
  parseBackupText,
  parseStoredSnapshot,
  serializeBackup,
  serializeSnapshot,
  summarizeSnapshot,
  type HomeroomDataSnapshot,
} from "../domain/persistence";

function createImportSnapshot(): HomeroomDataSnapshot {
  return {
    homeroomClasses: [
      {
        classId: "class-imported",
        name: "복원 학급",
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
    activeClassId: "missing-class",
    praiseRecords: [],
    agendaItems: [],
    ruleCandidates: [],
    classroomRules: [],
    activities: [],
    submissions: [],
    classSeatMaps: {},
    classSeatingConstraints: {},
    classManualAssignments: {},
  };
}

describe("persistence helpers", () => {
  it("serializes, parses, and normalizes a stored snapshot", () => {
    const payload = createSnapshotPayload({
      snapshot: createImportSnapshot(),
      savedAt: "2026-05-03T09:00:00.000Z",
    });
    const result = parseStoredSnapshot(serializeSnapshot(payload));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.snapshot.activeClassId).toBe("class-imported");
    expect(result.snapshot.classSeatMaps["class-imported"]).toEqual({
      rows: 4,
      columns: 4,
      disabledSeatIds: [],
      fixedAssignments: [],
    });
    expect(result.summary).toMatchObject({
      savedAt: "2026-05-03T09:00:00.000Z",
      classCount: 1,
      studentCount: 1,
    });
  });

  it("builds readable JSON backup files with export metadata", () => {
    const payload = createSnapshotPayload({
      snapshot: createImportSnapshot(),
      exportedAt: "2026-05-03T09:30:00.000Z",
    });
    const result = parseBackupText(serializeBackup(payload));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.summary.exportedAt).toBe("2026-05-03T09:30:00.000Z");
    expect(result.summary.classCount).toBe(1);
    expect(getBackupFileName(new Date("2026-05-03T12:00:00.000Z"))).toBe(
      "today-our-class-backup-2026-05-03.json",
    );
  });

  it("summarizes the data counts shown before import", () => {
    const snapshot = createImportSnapshot();

    expect(summarizeSnapshot(snapshot)).toMatchObject({
      classCount: 1,
      studentCount: 1,
      praiseCount: 0,
      agendaCount: 0,
      ruleCandidateCount: 0,
      classroomRuleCount: 0,
      activityCount: 0,
    });
  });

  it("rejects invalid or unsupported backup payloads", () => {
    expect(parseBackupText("{").ok).toBe(false);
    expect(
      parseBackupText(
        JSON.stringify({
          app: "other-app",
          schemaVersion: SCHEMA_VERSION,
          data: {},
        }),
      ),
    ).toEqual({ ok: false, message: "오늘 우리 반 백업 파일이 아닙니다." });
    expect(
      parseBackupText(
        JSON.stringify({
          app: APP_ID,
          schemaVersion: 999,
          data: {},
        }),
      ),
    ).toEqual({ ok: false, message: "지원하지 않는 백업 버전입니다." });
    expect(
      parseBackupText(
        JSON.stringify({
          app: APP_ID,
          schemaVersion: SCHEMA_VERSION,
          data: {
            homeroomClasses: [],
            activeClassId: "",
            praiseRecords: [],
            agendaItems: [],
            ruleCandidates: [],
            classroomRules: [],
            activities: [],
            submissions: [],
            classSeatMaps: {},
            classSeatingConstraints: {},
            classManualAssignments: {},
          },
        }),
      ),
    ).toEqual({ ok: false, message: "백업 파일에 학급이 없습니다." });
  });
});
