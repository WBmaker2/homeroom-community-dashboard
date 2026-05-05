export const TEACHER_SESSION_STORAGE_KEY =
  "homeroom-community-dashboard:teacher-session:v1";
export const TEACHER_AUTH_CONFIG_DISABLED_REASON =
  "Firebase 인증 설정이 없어 교사용 인증 기능이 비활성화됩니다.";
export const TEACHER_SIGN_IN_ERROR = "teacher-signin-failed";
export const TEACHER_SESSION_REFRESH_ERROR = "teacher-session-refresh-failed";

const IDENTITY_TOOLKIT_BASE_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
const SECURE_TOKEN_BASE_URL = "https://securetoken.googleapis.com/v1/token";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type TeacherSession = {
  teacherUid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type TeacherAuthConfig =
  | {
      enabled: true;
      projectId: string;
      apiKey: string;
    }
  | {
      enabled: false;
      reason: string;
      projectId?: string;
      apiKey?: string;
    };

type SignInResponse = {
  localId?: unknown;
  email?: unknown;
  idToken?: unknown;
  refreshToken?: unknown;
  expiresIn?: unknown;
};

type RefreshResponse = {
  user_id?: unknown;
  id_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

export function getTeacherAuthConfig(): TeacherAuthConfig {
  const env = import.meta.env;
  const projectId = trimEnvValue(env.VITE_FIREBASE_PROJECT_ID);
  const apiKey = trimEnvValue(env.VITE_FIREBASE_API_KEY);

  if (!apiKey) {
    return {
      enabled: false,
      projectId,
      apiKey,
      reason: TEACHER_AUTH_CONFIG_DISABLED_REASON,
    };
  }

  return {
    enabled: true,
    projectId: projectId ?? "",
    apiKey,
  };
}

export function isTeacherAuthEnabled(): boolean {
  return getTeacherAuthConfig().enabled;
}

export async function signInTeacherWithEmail(
  email: string,
  password: string,
): Promise<TeacherSession> {
  const config = requireTeacherAuthConfig();
  let payload: SignInResponse;

  try {
    const response = await fetch(`${IDENTITY_TOOLKIT_BASE_URL}?key=${config.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    if (!response.ok) {
      throw new Error(TEACHER_SIGN_IN_ERROR);
    }

    payload = (await response.json()) as SignInResponse;
  } catch (error) {
    if (error instanceof Error && error.message === TEACHER_AUTH_CONFIG_DISABLED_REASON) {
      throw error;
    }
    throw new Error(TEACHER_SIGN_IN_ERROR);
  }

  const session = mapSignInSession(payload);

  if (!session) {
    throw new Error(TEACHER_SIGN_IN_ERROR);
  }

  return session;
}

export async function refreshTeacherSession(session: TeacherSession): Promise<TeacherSession> {
  const config = requireTeacherAuthConfig();
  const response = await fetch(`${SECURE_TOKEN_BASE_URL}?key=${config.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(TEACHER_SESSION_REFRESH_ERROR);
  }

  const payload = (await response.json()) as RefreshResponse;
  const nextSession = mapRefreshSession(payload, session.email);

  if (!nextSession) {
    throw new Error(TEACHER_SESSION_REFRESH_ERROR);
  }

  return nextSession;
}

export function saveTeacherSession(
  session: TeacherSession,
  storage: BrowserStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(TEACHER_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable in private or restricted browser contexts.
  }
}

export function clearTeacherSession(storage: BrowserStorage | undefined = defaultStorage()): void {
  try {
    storage?.removeItem(TEACHER_SESSION_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable in private or restricted browser contexts.
  }
}

export function readStoredTeacherSession(
  storage: BrowserStorage | undefined = defaultStorage(),
): TeacherSession | null {
  try {
    const stored = storage?.getItem(TEACHER_SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return parseTeacherSession(stored);
  } catch {
    return null;
  }
}

export async function getValidTeacherSession(
  storage: BrowserStorage | undefined = defaultStorage(),
): Promise<TeacherSession | null> {
  const session = readStoredTeacherSession(storage);

  if (!session) {
    return null;
  }

  if (session.expiresAt - Date.now() > 60_000) {
    return session;
  }

  try {
    const nextSession = await refreshTeacherSession(session);
    saveTeacherSession(nextSession, storage);

    return nextSession;
  } catch {
    clearTeacherSession(storage);
    return null;
  }
}

export function signOutTeacherSession(storage: BrowserStorage | undefined = defaultStorage()): void {
  clearTeacherSession(storage);
}

export function parseTeacherSession(rawValue: string): TeacherSession | null {
  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (isTeacherSession(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function requireTeacherAuthConfig(): Extract<TeacherAuthConfig, { enabled: true }> {
  const config = getTeacherAuthConfig();

  if (!config.enabled) {
    throw new Error(config.reason);
  }

  return config;
}

function mapSignInSession(payload: SignInResponse): TeacherSession | null {
  const teacherUid = asString(payload.localId);
  const email = asString(payload.email);
  const idToken = asString(payload.idToken);
  const refreshToken = asString(payload.refreshToken);
  const expiresIn = parsePositiveNumber(payload.expiresIn);
  if (!teacherUid || !email || !idToken || !refreshToken || expiresIn === null) {
    return null;
  }

  return {
    teacherUid,
    email,
    idToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function mapRefreshSession(payload: RefreshResponse, email: string): TeacherSession | null {
  const teacherUid = asString(payload.user_id);
  const idToken = asString(payload.id_token);
  const refreshToken = asString(payload.refresh_token);
  const expiresIn = parsePositiveNumber(payload.expires_in);
  const normalizedEmail = email.trim();

  if (!teacherUid || !normalizedEmail || !idToken || !refreshToken || expiresIn === null) {
    return null;
  }

  return {
    teacherUid,
    email: normalizedEmail,
    idToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function isTeacherSession(value: unknown): value is TeacherSession {
  return (
    isObject(value) &&
    isNonEmptyString(value.teacherUid) &&
    isNonEmptyString(value.email) &&
    isNonEmptyString(value.idToken) &&
    isNonEmptyString(value.refreshToken) &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt)
  );
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed <= 0) {
    return null;
  }

  return parsed;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function trimEnvValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function defaultStorage(): BrowserStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
