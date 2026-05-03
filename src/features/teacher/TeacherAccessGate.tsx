import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export const TEACHER_PIN_STORAGE_KEY = "homeroom-community-dashboard:teacher-pin:v1";
export const TEACHER_UNLOCK_STORAGE_KEY = "homeroom-community-dashboard:teacher-unlocked:v1";

type TeacherAccessGateProps = {
  children: (controls: { lockTeacher: () => void }) => ReactNode;
};

export function TeacherAccessGate({ children }: TeacherAccessGateProps) {
  const [savedPin, setSavedPin] = useState(() => readStorage(window.localStorage, TEACHER_PIN_STORAGE_KEY));
  const [isUnlocked, setIsUnlocked] = useState(
    () => readStorage(window.sessionStorage, TEACHER_UNLOCK_STORAGE_KEY) === "true",
  );
  const [pinInput, setPinInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [message, setMessage] = useState("");
  const hasSavedPin = Boolean(savedPin);

  if (hasSavedPin && isUnlocked) {
    return <>{children({ lockTeacher })}</>;
  }

  function submitPinSetup() {
    if (pinInput.trim().length < 4) {
      setMessage("교사용 비밀번호는 4자리 이상으로 설정해 주세요.");
      return;
    }

    if (pinInput !== confirmInput) {
      setMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    writeStorage(window.localStorage, TEACHER_PIN_STORAGE_KEY, pinInput);
    writeStorage(window.sessionStorage, TEACHER_UNLOCK_STORAGE_KEY, "true");
    setSavedPin(pinInput);
    setIsUnlocked(true);
    setPinInput("");
    setConfirmInput("");
    setMessage("");
  }

  function unlockTeacher() {
    if (pinInput !== savedPin) {
      setMessage("비밀번호가 맞지 않습니다.");
      return;
    }

    writeStorage(window.sessionStorage, TEACHER_UNLOCK_STORAGE_KEY, "true");
    setIsUnlocked(true);
    setPinInput("");
    setMessage("");
  }

  function lockTeacher() {
    removeStorage(window.sessionStorage, TEACHER_UNLOCK_STORAGE_KEY);
    setIsUnlocked(false);
    setPinInput("");
    setConfirmInput("");
    setMessage("교사용 화면을 잠갔습니다.");
  }

  return (
    <main className="teacher-gate">
      <section className="teacher-lock-card">
        <div className="brand-lockup student-brand">
          <div className="brand-mark" aria-hidden="true">
            우
          </div>
          <div>
            <p className="brand-title">오늘 우리 반</p>
            <p className="brand-caption">교사용 잠금</p>
          </div>
        </div>

        <div className="gate-heading">
          {hasSavedPin ? (
            <LockKeyhole size={24} aria-hidden="true" />
          ) : (
            <ShieldCheck size={24} aria-hidden="true" />
          )}
          <div>
            <h1>{hasSavedPin ? "교사용 잠금 해제" : "교사용 비밀번호 설정"}</h1>
            <p>
              {hasSavedPin
                ? "교사용 대시보드는 비밀번호 확인 후 열립니다."
                : "처음 사용하는 브라우저입니다. 교사용 화면을 보호할 비밀번호를 정해 주세요."}
            </p>
          </div>
        </div>

        <div className="form-grid">
          <label>
            교사용 비밀번호
            <input
              autoComplete="current-password"
              inputMode="numeric"
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && hasSavedPin) {
                  unlockTeacher();
                }
              }}
            />
          </label>

          {!hasSavedPin && (
            <label>
              비밀번호 확인
              <input
                autoComplete="new-password"
                inputMode="numeric"
                type="password"
                value={confirmInput}
                onChange={(event) => setConfirmInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submitPinSetup();
                  }
                }}
              />
            </label>
          )}

          <button
            className="primary-button wide"
            type="button"
            onClick={hasSavedPin ? unlockTeacher : submitPinSetup}
          >
            {hasSavedPin ? "잠금 해제" : "설정하고 열기"}
          </button>
        </div>

        <p className="gate-note">
          이 잠금은 수업 중 화면 분리를 위한 브라우저 장치입니다. 실제 배포 보안은 서버 인증이 필요합니다.
        </p>

        {message && (
          <p className="student-message" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // The gate still works for the current render state even if storage is unavailable.
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing else to do if browser storage is unavailable.
  }
}
