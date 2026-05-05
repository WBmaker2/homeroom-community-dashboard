import { APP_ID } from "./persistence";
import { buildParticipationKey } from "./participation";
import type {
  HomeroomClass,
  ParticipationActivity,
  ParticipationSubmission,
  RuleCandidate,
  Student,
} from "./types";

export const CLOUD_SCHEMA_VERSION = 2;
export const CLOUD_SCHEMA_VERSION_LEGACY = 1;
export const CLOUD_SUBMISSION_SCHEMA_VERSION = 1;
export const DEFAULT_CLOUD_COLLECTION = "homeroomPublicActivities";

export type CloudPublicStudent = Pick<Student, "studentId" | "studentNumber" | "displayName">;

export type CloudPublicClass = Pick<HomeroomClass, "classId" | "name" | "status"> & {
  students: CloudPublicStudent[];
};

export type CloudRuleCandidate = Pick<
  RuleCandidate,
  "ruleCandidateId" | "title" | "description" | "status" | "votes"
>;

type CloudActivityCoreSnapshot = {
  app: typeof APP_ID;
  schemaVersion: typeof CLOUD_SCHEMA_VERSION | typeof CLOUD_SCHEMA_VERSION_LEGACY;
  teacherId: string;
  publishedAt: string;
  homeroomClass: CloudPublicClass;
  activity: ParticipationActivity;
  ruleCandidate?: CloudRuleCandidate;
};

export type CloudActivitySnapshot = CloudActivityCoreSnapshot & {
  schemaVersion: typeof CLOUD_SCHEMA_VERSION;
  teacherUid: string;
};

export type LegacyCloudActivitySnapshot = CloudActivityCoreSnapshot & {
  schemaVersion: typeof CLOUD_SCHEMA_VERSION_LEGACY;
  teacherUid?: never;
};

export type ParsedCloudActivitySnapshot = CloudActivitySnapshot | LegacyCloudActivitySnapshot;

export type CloudSubmissionPayload = {
  app: typeof APP_ID;
  schemaVersion: typeof CLOUD_SUBMISSION_SCHEMA_VERSION;
  participationKey: string;
  submittedAt: string;
  submission: ParticipationSubmission;
};

export type SubmissionMergeResult = {
  submissions: ParticipationSubmission[];
  added: ParticipationSubmission[];
  skippedCount: number;
};

export function createCloudActivitySnapshot(params: {
  teacherId: string;
  teacherUid: string;
  homeroomClass: HomeroomClass;
  activity: ParticipationActivity;
  ruleCandidates: RuleCandidate[];
  publishedAt: string;
}): CloudActivitySnapshot {
  const ruleCandidate =
    params.activity.type === "ruleVote" && params.activity.targetId
      ? params.ruleCandidates.find(
          (candidate) => candidate.ruleCandidateId === params.activity.targetId,
        )
      : undefined;

  return {
    app: APP_ID,
    schemaVersion: CLOUD_SCHEMA_VERSION,
    teacherId: params.teacherId,
    teacherUid: params.teacherUid,
    publishedAt: params.publishedAt,
    homeroomClass: {
      classId: params.homeroomClass.classId,
      name: params.homeroomClass.name,
      status: params.homeroomClass.status,
      students: params.homeroomClass.students.map((student) => ({
        studentId: student.studentId,
        studentNumber: student.studentNumber,
        displayName: student.displayName,
      })),
    },
    activity: params.activity,
    ruleCandidate: ruleCandidate
      ? {
          ruleCandidateId: ruleCandidate.ruleCandidateId,
          title: ruleCandidate.title,
          description: ruleCandidate.description,
          status: ruleCandidate.status,
          votes: ruleCandidate.votes,
        }
      : undefined,
  };
}

export function createCloudSubmissionPayload(
  submission: ParticipationSubmission,
): CloudSubmissionPayload {
  return {
    app: APP_ID,
    schemaVersion: CLOUD_SUBMISSION_SCHEMA_VERSION,
    participationKey: buildParticipationKey(
      submission.classId,
      submission.activityId,
      submission.studentId,
    ),
    submittedAt: submission.submittedAt,
    submission,
  };
}

export function getCloudSubmissionDocumentId(
  activity: ParticipationActivity,
  submission: ParticipationSubmission,
): string {
  if (activity.allowMultipleSubmissions) {
    return submission.submissionId;
  }

  return buildParticipationKey(submission.classId, submission.activityId, submission.studentId);
}

export function mergeParticipationSubmissions(
  existingSubmissions: ParticipationSubmission[],
  incomingSubmissions: ParticipationSubmission[],
  canShareParticipationKey: (submission: ParticipationSubmission) => boolean = () => false,
): SubmissionMergeResult {
  const existingIds = new Set(existingSubmissions.map((submission) => submission.submissionId));
  const existingKeys = new Set(
    existingSubmissions.map((submission) =>
      buildParticipationKey(submission.classId, submission.activityId, submission.studentId),
    ),
  );
  const added: ParticipationSubmission[] = [];

  for (const submission of incomingSubmissions) {
    const participationKey = buildParticipationKey(
      submission.classId,
      submission.activityId,
      submission.studentId,
    );

    if (existingIds.has(submission.submissionId) || existingKeys.has(participationKey)) {
      if (canShareParticipationKey(submission) && !existingIds.has(submission.submissionId)) {
        existingIds.add(submission.submissionId);
        added.push(submission);
      }

      continue;
    }

    existingIds.add(submission.submissionId);
    existingKeys.add(participationKey);
    added.push(submission);
  }

  return {
    submissions: [...added, ...existingSubmissions],
    added,
    skippedCount: incomingSubmissions.length - added.length,
  };
}

export function parseCloudActivitySnapshot(
  value: unknown,
): ParsedCloudActivitySnapshot | null {
  if (!isRecord(value) || value.app !== APP_ID) {
    return null;
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== CLOUD_SCHEMA_VERSION_LEGACY && schemaVersion !== CLOUD_SCHEMA_VERSION) {
    return null;
  }

  if (
    typeof value.teacherId !== "string" ||
    typeof value.publishedAt !== "string" ||
    !isCloudPublicClass(value.homeroomClass) ||
    !isParticipationActivity(value.activity)
  ) {
    return null;
  }

  const baseSnapshot: Omit<CloudActivityCoreSnapshot, "schemaVersion" | "teacherUid"> = {
    app: APP_ID,
    teacherId: value.teacherId,
    publishedAt: value.publishedAt,
    homeroomClass: value.homeroomClass,
    activity: value.activity,
  };
  const snapshotWithCandidate = isCloudRuleCandidate(value.ruleCandidate)
    ? { ...baseSnapshot, ruleCandidate: value.ruleCandidate }
    : baseSnapshot;

  if (schemaVersion === CLOUD_SCHEMA_VERSION) {
    if (typeof value.teacherUid !== "string") {
      return null;
    }

    return {
      ...snapshotWithCandidate,
      schemaVersion: CLOUD_SCHEMA_VERSION,
      teacherUid: value.teacherUid,
    };
  }

  return {
    ...snapshotWithCandidate,
    schemaVersion: CLOUD_SCHEMA_VERSION_LEGACY,
  };
}

export function parseCloudSubmissionPayload(value: unknown): CloudSubmissionPayload | null {
  if (
    !isRecord(value) ||
    value.app !== APP_ID ||
    value.schemaVersion !== CLOUD_SUBMISSION_SCHEMA_VERSION
  ) {
    return null;
  }

  if (
    typeof value.participationKey !== "string" ||
    typeof value.submittedAt !== "string" ||
    !isParticipationSubmission(value.submission)
  ) {
    return null;
  }

  return {
    app: APP_ID,
    schemaVersion: CLOUD_SUBMISSION_SCHEMA_VERSION,
    participationKey: value.participationKey,
    submittedAt: value.submittedAt,
    submission: value.submission,
  };
}

function isCloudPublicClass(value: unknown): value is CloudPublicClass {
  return (
    isRecord(value) &&
    typeof value.classId === "string" &&
    typeof value.name === "string" &&
    (value.status === "active" || value.status === "archived") &&
    Array.isArray(value.students) &&
    value.students.every(isCloudPublicStudent)
  );
}

function isCloudPublicStudent(value: unknown): value is CloudPublicStudent {
  return (
    isRecord(value) &&
    typeof value.studentId === "string" &&
    typeof value.studentNumber === "string" &&
    typeof value.displayName === "string"
  );
}

function isCloudRuleCandidate(value: unknown): value is CloudRuleCandidate {
  return (
    isRecord(value) &&
    typeof value.ruleCandidateId === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.status === "string" &&
    isRecord(value.votes) &&
    typeof value.votes.agree === "number" &&
    typeof value.votes.needsRevision === "number"
  );
}

function isParticipationActivity(value: unknown): value is ParticipationActivity {
  return (
    isRecord(value) &&
    typeof value.activityId === "string" &&
    typeof value.classId === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.code === "string" &&
    (value.status === "open" || value.status === "closed") &&
    typeof value.opensAt === "string" &&
    typeof value.closesAt === "string" &&
    typeof value.isAnonymous === "boolean" &&
    typeof value.allowMultipleSubmissions === "boolean"
  );
}

function isParticipationSubmission(value: unknown): value is ParticipationSubmission {
  return (
    isRecord(value) &&
    typeof value.submissionId === "string" &&
    typeof value.classId === "string" &&
    typeof value.activityId === "string" &&
    typeof value.studentId === "string" &&
    typeof value.submittedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
