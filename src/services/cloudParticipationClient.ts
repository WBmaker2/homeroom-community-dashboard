import {
  DEFAULT_CLOUD_COLLECTION,
  createCloudSubmissionPayload,
  getCloudSubmissionDocumentId,
  parseCloudActivitySnapshot,
  parseCloudSubmissionPayload,
  type CloudActivitySnapshot,
} from "../domain/cloudParticipation";
import { APP_ID } from "../domain/persistence";
import { buildParticipationKey } from "../domain/participation";
import type { ParticipationActivity, ParticipationSubmission } from "../domain/types";

export type CloudParticipationConfig =
  | {
      enabled: true;
      projectId: string;
      apiKey: string;
      collectionRoot: string;
    }
  | {
      enabled: false;
      projectId?: string;
      apiKey?: string;
      collectionRoot: string;
      reason: string;
    };

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { timestampValue: string };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreListResponse = {
  documents?: FirestoreDocument[];
};

const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects";

export function getCloudParticipationConfig(): CloudParticipationConfig {
  const env = import.meta.env;
  const projectId = trimEnvValue(env.VITE_FIREBASE_PROJECT_ID);
  const apiKey = trimEnvValue(env.VITE_FIREBASE_API_KEY);
  const collectionRoot =
    trimEnvValue(env.VITE_FIREBASE_PARTICIPATION_COLLECTION) ?? DEFAULT_CLOUD_COLLECTION;

  if (!projectId || !apiKey) {
    return {
      enabled: false,
      projectId,
      apiKey,
      collectionRoot,
      reason: "Firebase 환경변수가 없어 로컬 모드로 동작합니다.",
    };
  }

  return {
    enabled: true,
    projectId,
    apiKey,
    collectionRoot,
  };
}

export function isCloudParticipationEnabled(): boolean {
  return getCloudParticipationConfig().enabled;
}

export async function publishCloudActivity(snapshot: CloudActivitySnapshot): Promise<void> {
  const config = requireCloudConfig();
  const url = buildDocumentUrl(config, [config.collectionRoot, snapshot.activity.code]);
  const nowIso = new Date().toISOString();

  await writeFirestoreDocument(url, {
    app: { stringValue: APP_ID },
    schemaVersion: { integerValue: String(snapshot.schemaVersion) },
    code: { stringValue: snapshot.activity.code },
    teacherId: { stringValue: snapshot.teacherId },
    classId: { stringValue: snapshot.activity.classId },
    activityId: { stringValue: snapshot.activity.activityId },
    publishedAt: { timestampValue: snapshot.publishedAt },
    updatedAt: { timestampValue: nowIso },
    payload: { stringValue: JSON.stringify(snapshot) },
  });
}

export async function fetchCloudActivityByCode(
  code: string,
): Promise<CloudActivitySnapshot | null> {
  const config = getCloudParticipationConfig();

  if (!config.enabled) {
    return null;
  }

  const url = buildDocumentUrl(config, [config.collectionRoot, code.trim().toUpperCase()]);
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("cloud-activity-fetch-failed");
  }

  const document = (await response.json()) as FirestoreDocument;
  const payload = getStringField(document, "payload");

  if (!payload) {
    return null;
  }

  return parseCloudActivitySnapshot(JSON.parse(payload));
}

export async function submitCloudParticipation(params: {
  activity: ParticipationActivity;
  submission: ParticipationSubmission;
}): Promise<void> {
  const config = requireCloudConfig();
  const documentId = getCloudSubmissionDocumentId(params.activity, params.submission);
  const participationKey = buildParticipationKey(
    params.submission.classId,
    params.submission.activityId,
    params.submission.studentId,
  );
  const payload = createCloudSubmissionPayload(params.submission);
  const url = buildDocumentUrl(config, [
    config.collectionRoot,
    params.activity.code,
    "submissions",
    documentId,
  ]);

  await writeFirestoreDocument(url, {
    app: { stringValue: APP_ID },
    schemaVersion: { integerValue: String(payload.schemaVersion) },
    classId: { stringValue: params.submission.classId },
    activityId: { stringValue: params.submission.activityId },
    studentId: { stringValue: params.submission.studentId },
    participationKey: { stringValue: participationKey },
    submittedAt: { timestampValue: params.submission.submittedAt },
    payload: { stringValue: JSON.stringify(payload) },
  });
}

export async function fetchCloudSubmissions(
  activity: ParticipationActivity,
): Promise<ParticipationSubmission[]> {
  const config = requireCloudConfig();
  const url = buildDocumentUrl(config, [config.collectionRoot, activity.code, "submissions"]);
  const response = await fetch(url);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error("cloud-submission-fetch-failed");
  }

  const payload = (await response.json()) as FirestoreListResponse;

  return (payload.documents ?? [])
    .map((document) => {
      const rawPayload = getStringField(document, "payload");

      if (!rawPayload) {
        return null;
      }

      return parseCloudSubmissionPayload(JSON.parse(rawPayload))?.submission ?? null;
    })
    .filter((submission): submission is ParticipationSubmission => submission !== null);
}

export async function deleteCloudSubmission(params: {
  activity: ParticipationActivity;
  submission: ParticipationSubmission;
}): Promise<void> {
  const config = getCloudParticipationConfig();

  if (!config.enabled) {
    return;
  }

  const documentId = getCloudSubmissionDocumentId(params.activity, params.submission);
  const url = buildDocumentUrl(config, [
    config.collectionRoot,
    params.activity.code,
    "submissions",
    documentId,
  ]);
  const response = await fetch(url, { method: "DELETE" });

  if (!response.ok && response.status !== 404) {
    throw new Error("cloud-submission-delete-failed");
  }
}

function requireCloudConfig(): Extract<CloudParticipationConfig, { enabled: true }> {
  const config = getCloudParticipationConfig();

  if (!config.enabled) {
    throw new Error(config.reason);
  }

  return config;
}

function buildDocumentUrl(
  config: Extract<CloudParticipationConfig, { enabled: true }>,
  pathSegments: string[],
): string {
  const documentPath = pathSegments.map(encodeURIComponent).join("/");
  const query = new URLSearchParams({ key: config.apiKey });

  return `${FIRESTORE_BASE_URL}/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${documentPath}?${query.toString()}`;
}

async function writeFirestoreDocument(
  url: string,
  fields: Record<string, FirestoreValue>,
): Promise<void> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    throw new Error("cloud-document-write-failed");
  }
}

function getStringField(document: FirestoreDocument, fieldName: string): string | null {
  const field = document.fields?.[fieldName];

  return field && "stringValue" in field ? field.stringValue : null;
}

function trimEnvValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
