import type { ParticipationActivity } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const TEACHER_ID_STORAGE_KEY = "homeroom-community-dashboard:teacher-id:v1";

export type RandomSegmentFactory = (length: number) => string;

export function createTeacherId(randomSegment: RandomSegmentFactory = createRandomSegment): string {
  return `T-${randomSegment(8)}`;
}

export function getOrCreateTeacherId(
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
  randomSegment: RandomSegmentFactory = createRandomSegment,
): string {
  const storedTeacherId = readTeacherId(storage);

  if (storedTeacherId) {
    return storedTeacherId;
  }

  const teacherId = createTeacherId(randomSegment);

  saveTeacherId(storage, teacherId);

  return teacherId;
}

export function saveTeacherId(storage: Storage | undefined, teacherId: string): void {
  if (!isTeacherId(teacherId)) {
    return;
  }

  try {
    storage?.setItem(TEACHER_ID_STORAGE_KEY, teacherId);
  } catch {
    // localStorage may be unavailable in private or restricted browser contexts.
  }
}

export function createParticipationCode(params: {
  prefix: string;
  teacherId: string;
  existingCodes?: string[];
  randomSegment?: RandomSegmentFactory;
}): string {
  const prefix = normalizeParticipationPart(params.prefix).slice(0, 8) || "JOIN";
  const teacherSegment = getTeacherCodeSegment(params.teacherId);
  const randomSegment = params.randomSegment ?? createRandomSegment;
  const existingCodes = new Set(
    (params.existingCodes ?? []).map((code) => normalizeParticipationCode(code)),
  );

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const code = `${prefix}-${teacherSegment}-${randomSegment(4)}`;

    if (!existingCodes.has(normalizeParticipationCode(code))) {
      return code;
    }
  }

  return `${prefix}-${teacherSegment}-${randomSegment(6)}`;
}

export function getExistingActivityCodes(activities: ParticipationActivity[]): string[] {
  return activities.map((activity) => activity.code);
}

export function getTeacherCodeSegment(teacherId: string): string {
  const normalizedTeacherId = normalizeCodePart(teacherId);
  const withoutPrefix =
    normalizedTeacherId.startsWith("T") && normalizedTeacherId.length > 4
      ? normalizedTeacherId.slice(1)
      : normalizedTeacherId;

  return withoutPrefix.slice(0, 4).padEnd(4, "X") || "TEAC";
}

export function normalizeParticipationCode(code: string): string {
  return code
    .split("-")
    .map((part) => normalizeParticipationPart(part))
    .filter(Boolean)
    .join("-");
}

export function createRandomSegment(length: number): string {
  const bytes = new Uint8Array(length);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  }

  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);

    return CODE_ALPHABET[index];
  }).join("");
}

function readTeacherId(storage: Storage | undefined): string | null {
  try {
    const storedValue = storage?.getItem(TEACHER_ID_STORAGE_KEY);

    return storedValue && isTeacherId(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

export function isTeacherId(value: string): boolean {
  return /^T-[A-Z2-9]{8}$/.test(value);
}

function normalizeCodePart(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/[^A-Z2-9]/g, "")
    .replaceAll(/[IO]/g, "");
}

function normalizeParticipationPart(value: string): string {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
}
