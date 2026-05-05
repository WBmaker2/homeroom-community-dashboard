import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_ACTIVITY_AUTH_REQUIRED_ERROR,
  CLOUD_SUBMISSION_AUTH_REQUIRED_ERROR,
  deleteCloudSubmission,
  fetchCloudActivityByCode,
  fetchCloudSubmissions,
  publishCloudActivity,
  submitCloudParticipation,
} from "../services/cloudParticipationClient";
import {
  createCloudActivitySnapshot,
  createCloudSubmissionPayload,
  type CloudSubmissionPayload,
} from "../domain/cloudParticipation";
import { sampleActivities, sampleClass, sampleSubmissions } from "../data/sampleClass";
import { buildParticipationKey } from "../domain/participation";

describe("cloud participation client auth boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "homeroom-test-project");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key-123");
    vi.stubEnv("VITE_FIREBASE_PARTICIPATION_COLLECTION", "homeroomPublicActivities");
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps cloud activity fetch public and does not attach auth header", async () => {
    const responseBody = {
      fields: {
        payload: {
          stringValue: JSON.stringify(
            createCloudActivitySnapshot({
              teacherId: "T-ABCDE",
              teacherUid: "uid-teacher-1",
              homeroomClass: sampleClass,
              activity: sampleActivities[0]!,
              ruleCandidates: [],
              publishedAt: "2026-05-05T10:00:00.000Z",
            }),
          ),
        },
      },
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(responseBody), { status: 200 }),
    );

    await fetchCloudActivityByCode("WARM-DEMO-0000");

    const [requestUrl, requestOptions] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(requestUrl).toBe(
      "https://firestore.googleapis.com/v1/projects/homeroom-test-project/databases/(default)/documents/homeroomPublicActivities/WARM-DEMO-0000?key=api-key-123",
    );
    expect(requestOptions).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) }),
    );
  });

  it("publishes cloud activity only with teacher auth header", async () => {
    const snapshot = createCloudActivitySnapshot({
      teacherId: "T-ABCDE",
      teacherUid: "uid-teacher-1",
      homeroomClass: sampleClass,
      activity: sampleActivities[0]!,
      ruleCandidates: [],
      publishedAt: "2026-05-05T10:00:00.000Z",
    });

    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    await publishCloudActivity(snapshot, "teacher-id-token");

    const [, requestOptions] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];

    expect(requestOptions?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer teacher-id-token",
    });
    const payload = JSON.parse((requestOptions as { body?: string }).body as string);
    expect(payload.fields.teacherUid.stringValue).toBe("uid-teacher-1");
  });

  it("publishes cloud activity with clear error when auth token missing", async () => {
    const snapshot = createCloudActivitySnapshot({
      teacherId: "T-ABCDE",
      teacherUid: "uid-teacher-1",
      homeroomClass: sampleClass,
      activity: sampleActivities[0]!,
      ruleCandidates: [],
      publishedAt: "2026-05-05T10:00:00.000Z",
    });

    await expect(publishCloudActivity(snapshot, "" as string)).rejects.toThrow(
      CLOUD_ACTIVITY_AUTH_REQUIRED_ERROR,
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reads cloud submissions only with teacher auth header", async () => {
    const payload = createCloudSubmissionPayload(sampleSubmissions[0]!);
    const submissionPayload: CloudSubmissionPayload = {
      ...payload,
      participationKey: payload.participationKey,
      submission: sampleSubmissions[0]!,
    };
    const listResponse = {
      documents: [
        {
          fields: {
            classId: { stringValue: sampleSubmissions[0]!.classId },
            activityId: { stringValue: sampleSubmissions[0]!.activityId },
            studentId: { stringValue: sampleSubmissions[0]!.studentId },
            participationKey: { stringValue: payload.participationKey },
            payload: {
              stringValue: JSON.stringify(submissionPayload),
            },
          },
        },
      ],
    };

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(listResponse), { status: 200 }),
    );

    const submissions = await fetchCloudSubmissions({
      activity: sampleActivities[0]!,
      idToken: "teacher-id-token",
    });

    expect(submissions).toEqual([sampleSubmissions[0]!]);
    const [, requestOptions] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(requestOptions?.headers).toMatchObject({
      Authorization: "Bearer teacher-id-token",
    });
  });

  it("ignores imported cloud submissions whose checked fields and payload target differ", async () => {
    const selectedSubmission = sampleSubmissions[0]!;
    const selectedParticipationKey = buildParticipationKey(
      selectedSubmission.classId,
      selectedSubmission.activityId,
      selectedSubmission.studentId,
    );
    const mismatchedSubmission = {
      ...selectedSubmission,
      activityId: "activity-other",
    };
    const mismatchedPayload: CloudSubmissionPayload = {
      ...createCloudSubmissionPayload(mismatchedSubmission),
      submission: mismatchedSubmission,
    };
    const listResponse = {
      documents: [
        {
          fields: {
            classId: { stringValue: selectedSubmission.classId },
            activityId: { stringValue: selectedSubmission.activityId },
            studentId: { stringValue: selectedSubmission.studentId },
            participationKey: { stringValue: selectedParticipationKey },
            payload: {
              stringValue: JSON.stringify(mismatchedPayload),
            },
          },
        },
      ],
    };

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(listResponse), { status: 200 }),
    );

    const submissions = await fetchCloudSubmissions({
      activity: sampleActivities[0]!,
      idToken: "teacher-id-token",
    });

    expect(submissions).toEqual([]);
  });

  it("ignores imported cloud submissions with mismatched participation keys", async () => {
    const submission = sampleSubmissions[0]!;
    const validPayload = createCloudSubmissionPayload(submission);
    const listResponse = {
      documents: [
        {
          fields: {
            classId: { stringValue: submission.classId },
            activityId: { stringValue: submission.activityId },
            studentId: { stringValue: submission.studentId },
            participationKey: { stringValue: "wrong-key" },
            payload: {
              stringValue: JSON.stringify(validPayload),
            },
          },
        },
      ],
    };

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(listResponse), { status: 200 }),
    );

    const submissions = await fetchCloudSubmissions({
      activity: sampleActivities[0]!,
      idToken: "teacher-id-token",
    });

    expect(submissions).toEqual([]);
  });

  it("requires teacher auth token for cloud submission list fetch", async () => {
    await expect(fetchCloudSubmissions({
      activity: sampleActivities[0]!,
      idToken: "",
    })).rejects.toThrow(CLOUD_SUBMISSION_AUTH_REQUIRED_ERROR);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("deletes cloud submission only with teacher auth header", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await deleteCloudSubmission({
      activity: sampleActivities[0]!,
      submission: sampleSubmissions[0]!,
      idToken: "teacher-id-token",
    });

    const [, requestOptions] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(requestOptions?.method).toBe("DELETE");
    expect(requestOptions?.headers).toMatchObject({
      Authorization: "Bearer teacher-id-token",
    });
  });

  it("requires teacher auth token for cloud submission delete", async () => {
    await expect(
      deleteCloudSubmission({
        activity: sampleActivities[0]!,
        submission: sampleSubmissions[0]!,
        idToken: "",
      }),
    ).rejects.toThrow(CLOUD_SUBMISSION_AUTH_REQUIRED_ERROR);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("submits cloud participation without auth header", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    await submitCloudParticipation({
      activity: sampleActivities[0]!,
      submission: sampleSubmissions[0]!,
    });

    const [, requestOptions] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(requestOptions?.method).toBe("PATCH");
    expect(requestOptions?.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestOptions?.headers).not.toHaveProperty("Authorization");
  });
});
