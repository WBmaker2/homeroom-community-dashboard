import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEACHER_AUTH_CONFIG_DISABLED_REASON,
  TEACHER_SESSION_REFRESH_ERROR,
  TEACHER_SESSION_STORAGE_KEY,
  clearTeacherSession,
  getValidTeacherSession,
  isTeacherAuthEnabled,
  readStoredTeacherSession,
  refreshTeacherSession,
  saveTeacherSession,
  signInTeacherWithEmail,
} from "../services/firebaseTeacherAuth";

describe("firebase teacher auth service", () => {
  const defaultSignInResponse = {
    localId: "teacher-uid",
    email: "teacher@example.com",
    idToken: "id-token-1",
    refreshToken: "refresh-1",
    expiresIn: "3600",
  };

  const defaultRefreshResponse = {
    user_id: "teacher-uid",
    id_token: "id-token-2",
    refresh_token: "refresh-2",
    expires_in: "1800",
  };

  beforeEach(() => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "homeroom-test");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key-123");
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("exposes disabled auth config when API key missing", () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");

    expect(isTeacherAuthEnabled()).toBe(false);
    expect(TEACHER_AUTH_CONFIG_DISABLED_REASON).toBeTruthy();
  });

  it("signs in teacher by Firebase REST and maps response fields", async () => {
    const fixedNow = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(defaultSignInResponse), { status: 200 }),
    );

    const session = await signInTeacherWithEmail("teacher@example.com", "password123");

    expect(session).toEqual({
      teacherUid: "teacher-uid",
      email: "teacher@example.com",
      idToken: "id-token-1",
      refreshToken: "refresh-1",
      expiresAt: fixedNow + 3600 * 1000,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=api-key-123",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: "teacher@example.com",
          password: "password123",
          returnSecureToken: true,
        }),
      }),
    );
    nowSpy.mockRestore();
  });

  it("validates stored session shape and discards invalid data", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      TEACHER_SESSION_STORAGE_KEY,
      JSON.stringify({
        teacherUid: "teacher-uid",
        email: "teacher@example.com",
        idToken: "id",
        refreshToken: "refresh",
      }),
    );

    expect(readStoredTeacherSession(storage)).toBeNull();
  });

  it("returns stored session when it is still valid for more than 60 seconds", async () => {
    const storage = createMemoryStorage();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    saveTeacherSession(
      {
        teacherUid: "teacher-uid",
        email: "teacher@example.com",
        idToken: "id-token",
        refreshToken: "refresh-token",
        expiresAt: 1_700_000_000_000 + 120_000,
      },
      storage,
    );

    const session = await getValidTeacherSession(storage);

    expect(session).toEqual({
      teacherUid: "teacher-uid",
      email: "teacher@example.com",
      idToken: "id-token",
      refreshToken: "refresh-token",
      expiresAt: 1_700_000_000_000 + 120_000,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refreshes an expired stored session and persists the refreshed result", async () => {
    const storage = createMemoryStorage();
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    saveTeacherSession(
      {
        teacherUid: "teacher-uid",
        email: "teacher@example.com",
        idToken: "old-id-token",
        refreshToken: "old-refresh",
        expiresAt: fixedNow - 1_000,
      },
      storage,
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(defaultRefreshResponse), { status: 200 }),
    );

    const session = await getValidTeacherSession(storage);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://securetoken.googleapis.com/v1/token?key=api-key-123",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "old-refresh",
        }).toString(),
      }),
    );
    expect(session).toEqual({
      teacherUid: "teacher-uid",
      email: "teacher@example.com",
      idToken: "id-token-2",
      refreshToken: "refresh-2",
      expiresAt: fixedNow + 1_800 * 1000,
    });

    const persisted = readStoredTeacherSession(storage);
    expect(persisted).toEqual({
      teacherUid: "teacher-uid",
      email: "teacher@example.com",
      idToken: "id-token-2",
      refreshToken: "refresh-2",
      expiresAt: fixedNow + 1_800 * 1000,
    });
  });

  it("clears stored session and returns null when refresh fails", async () => {
    const storage = createMemoryStorage();
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    saveTeacherSession(
      {
        teacherUid: "teacher-uid",
        email: "teacher@example.com",
        idToken: "old-id-token",
        refreshToken: "old-refresh",
        expiresAt: fixedNow - 1_000,
      },
      storage,
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "INVALID_GRANT" } }), { status: 400 }),
    );

    const session = await getValidTeacherSession(storage);

    expect(session).toBeNull();
    expect(readStoredTeacherSession(storage)).toBeNull();
  });

  it("fails stable on sign-in when config is disabled", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    await expect(signInTeacherWithEmail("teacher@example.com", "password")).rejects.toThrow(
      TEACHER_AUTH_CONFIG_DISABLED_REASON,
    );
  });

  it("fails stable on refresh when endpoint returns error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(
      refreshTeacherSession({
        teacherUid: "teacher-uid",
        email: "teacher@example.com",
        idToken: "id-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() - 1000,
      }),
    ).rejects.toThrow(TEACHER_SESSION_REFRESH_ERROR);
  });

  it("clears session on explicit sign-out", () => {
    const storage = createMemoryStorage();
    storage.setItem(TEACHER_SESSION_STORAGE_KEY, JSON.stringify({
      teacherUid: "teacher-uid",
      email: "teacher@example.com",
      idToken: "id-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 1000,
    }));

    clearTeacherSession(storage);

    expect(readStoredTeacherSession(storage)).toBeNull();
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    length: 0,
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}
