import type {
  AgendaItem,
  ClassroomRule,
  HomeroomClass,
  ParticipationActivity,
  ParticipationSubmission,
  PraiseRecord,
  RuleCandidate,
  SeatAssignment,
  SeatMap,
  SeatingConstraint,
} from "./types";

export const APP_ID = "homeroom-community-dashboard";
export const STORAGE_KEY = `${APP_ID}:v1`;
export const SCHEMA_VERSION = 1;

export type HomeroomDataSnapshot = {
  teacherId?: string;
  homeroomClasses: HomeroomClass[];
  activeClassId: string;
  praiseRecords: PraiseRecord[];
  agendaItems: AgendaItem[];
  ruleCandidates: RuleCandidate[];
  classroomRules: ClassroomRule[];
  activities: ParticipationActivity[];
  submissions: ParticipationSubmission[];
  classSeatMaps: Record<string, SeatMap>;
  classSeatingConstraints: Record<string, SeatingConstraint[]>;
  classManualAssignments: Record<string, SeatAssignment[]>;
};

export type SnapshotPayload = {
  app: typeof APP_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  savedAt?: string;
  exportedAt?: string;
  data: HomeroomDataSnapshot;
};

export type SnapshotSummary = {
  exportedAt?: string;
  savedAt?: string;
  classCount: number;
  studentCount: number;
  praiseCount: number;
  agendaCount: number;
  ruleCandidateCount: number;
  classroomRuleCount: number;
  activityCount: number;
};

export type ParseSnapshotResult =
  | { ok: true; payload: SnapshotPayload; snapshot: HomeroomDataSnapshot; summary: SnapshotSummary }
  | { ok: false; message: string };

export function createSnapshotPayload(params: {
  snapshot: HomeroomDataSnapshot;
  savedAt?: string;
  exportedAt?: string;
}): SnapshotPayload {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    savedAt: params.savedAt,
    exportedAt: params.exportedAt,
    data: normalizeSnapshot(params.snapshot),
  };
}

export function serializeSnapshot(payload: SnapshotPayload): string {
  return JSON.stringify(payload);
}

export function serializeBackup(payload: SnapshotPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseStoredSnapshot(raw: string): ParseSnapshotResult {
  return parseSnapshotText(raw);
}

export function parseBackupText(raw: string): ParseSnapshotResult {
  return parseSnapshotText(raw);
}

export function summarizeSnapshot(
  snapshot: HomeroomDataSnapshot,
  meta?: Pick<SnapshotPayload, "exportedAt" | "savedAt">,
): SnapshotSummary {
  return {
    exportedAt: meta?.exportedAt,
    savedAt: meta?.savedAt,
    classCount: snapshot.homeroomClasses.length,
    studentCount: snapshot.homeroomClasses.reduce(
      (total, homeroomClass) => total + homeroomClass.students.length,
      0,
    ),
    praiseCount: snapshot.praiseRecords.length,
    agendaCount: snapshot.agendaItems.length,
    ruleCandidateCount: snapshot.ruleCandidates.length,
    classroomRuleCount: snapshot.classroomRules.length,
    activityCount: snapshot.activities.length,
  };
}

export function getBackupFileName(now = new Date()): string {
  const datePart = now.toISOString().slice(0, 10);

  return `today-our-class-backup-${datePart}.json`;
}

export function downloadJsonBackup(params: {
  snapshot: HomeroomDataSnapshot;
  now?: Date;
}): void {
  const now = params.now ?? new Date();
  const payload = createSnapshotPayload({
    snapshot: params.snapshot,
    exportedAt: now.toISOString(),
  });
  const blob = new Blob([serializeBackup(payload)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = getBackupFileName(now);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseSnapshotText(raw: string): ParseSnapshotResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "JSON 파일을 읽을 수 없습니다." };
  }

  const validation = validateSnapshotPayload(parsed);

  if (!validation.ok) {
    return validation;
  }

  const snapshot = normalizeSnapshot(validation.payload.data);

  return {
    ok: true,
    payload: {
      ...validation.payload,
      data: snapshot,
    },
    snapshot,
    summary: summarizeSnapshot(snapshot, validation.payload),
  };
}

function validateSnapshotPayload(value: unknown): ParseSnapshotResult {
  if (!isRecord(value)) {
    return { ok: false, message: "백업 데이터 구조가 올바르지 않습니다." };
  }

  if (value.app !== APP_ID) {
    return { ok: false, message: "오늘 우리 반 백업 파일이 아닙니다." };
  }

  if (value.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, message: "지원하지 않는 백업 버전입니다." };
  }

  if (!isRecord(value.data)) {
    return { ok: false, message: "백업 데이터 구조가 올바르지 않습니다." };
  }

  const data = value.data;
  const hasRequiredArrays =
    Array.isArray(data.homeroomClasses) &&
    Array.isArray(data.praiseRecords) &&
    Array.isArray(data.agendaItems) &&
    Array.isArray(data.ruleCandidates) &&
    Array.isArray(data.classroomRules) &&
    Array.isArray(data.activities) &&
    Array.isArray(data.submissions);
  const hasRequiredMaps =
    isRecord(data.classSeatMaps) &&
    isRecord(data.classSeatingConstraints) &&
    isRecord(data.classManualAssignments);

  if (!hasRequiredArrays || !hasRequiredMaps || typeof data.activeClassId !== "string") {
    return { ok: false, message: "백업 데이터 구조가 올바르지 않습니다." };
  }

  const snapshot = data as HomeroomDataSnapshot;

  if (snapshot.homeroomClasses.length === 0) {
    return { ok: false, message: "백업 파일에 학급이 없습니다." };
  }

  return {
    ok: true,
    payload: {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      savedAt: typeof value.savedAt === "string" ? value.savedAt : undefined,
      exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : undefined,
      data: snapshot,
    },
    snapshot,
    summary: summarizeSnapshot(snapshot, value),
  };
}

export function normalizeSnapshot(snapshot: HomeroomDataSnapshot): HomeroomDataSnapshot {
  const homeroomClasses = snapshot.homeroomClasses.length > 0 ? snapshot.homeroomClasses : [];
  const activeClassId = homeroomClasses.some(
    (homeroomClass) => homeroomClass.classId === snapshot.activeClassId,
  )
    ? snapshot.activeClassId
    : homeroomClasses[0]?.classId ?? "";
  const classSeatMaps = { ...snapshot.classSeatMaps };
  const classSeatingConstraints = { ...snapshot.classSeatingConstraints };
  const classManualAssignments = { ...snapshot.classManualAssignments };

  for (const homeroomClass of homeroomClasses) {
    classSeatMaps[homeroomClass.classId] ??= createDefaultSeatMap();
    classSeatingConstraints[homeroomClass.classId] ??= [];
    classManualAssignments[homeroomClass.classId] ??= [];
  }

  return {
    ...snapshot,
    teacherId: snapshot.teacherId,
    homeroomClasses,
    activeClassId,
    classSeatMaps,
    classSeatingConstraints,
    classManualAssignments,
  };
}

function createDefaultSeatMap(): SeatMap {
  return {
    rows: 4,
    columns: 4,
    disabledSeatIds: [],
    fixedAssignments: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
