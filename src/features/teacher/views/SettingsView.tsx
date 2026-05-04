import { Archive, Database, Download, Plus, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeRosterNumber } from "../../../domain/classSettings";
import { parseBackupText, type ParseSnapshotResult } from "../../../domain/persistence";
import type { HomeroomClass, Student } from "../../../domain/types";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";

type SettingsViewProps = {
  state: HomeroomState;
  actions: HomeroomActions;
};

const gradeBandLabels: Record<HomeroomClass["gradeBand"], string> = {
  elementary: "초등",
  middle: "중등",
  high: "고등",
  mixed: "혼합",
};

export function SettingsView({ state, actions }: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newClassName, setNewClassName] = useState("");
  const [newClassGradeBand, setNewClassGradeBand] =
    useState<HomeroomClass["gradeBand"]>("elementary");
  const [className, setClassName] = useState(state.homeroomClass.name);
  const [gradeBand, setGradeBand] = useState(state.homeroomClass.gradeBand);
  const [classStatus, setClassStatus] = useState(state.homeroomClass.status);
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentDisplayName, setStudentDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [backupPreview, setBackupPreview] = useState<{
    fileName: string;
    result: ParseSnapshotResult;
  } | null>(null);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const visibleMessage = message || state.persistence.message;
  const isClassArchived = state.homeroomClass.status === "archived";

  useEffect(() => {
    setClassName(state.homeroomClass.name);
    setGradeBand(state.homeroomClass.gradeBand);
    setClassStatus(state.homeroomClass.status);
  }, [state.homeroomClass]);

  function createClass() {
    if (newClassName.trim().length === 0) {
      setMessage("학급명을 입력해 주세요.");
      return;
    }

    actions.addHomeroomClass({
      name: newClassName,
      gradeBand: newClassGradeBand,
    });
    setNewClassName("");
    setMessage("새 학급을 등록했습니다.");
  }

  function saveClass() {
    actions.updateHomeroomClass({
      name: className,
      gradeBand,
      status: classStatus,
    });
    setMessage("학급 정보를 저장했습니다.");
  }

  function deleteClass(classId: string) {
    const didDelete = actions.deleteHomeroomClass(classId);

    setMessage(didDelete ? "학급을 삭제했습니다." : "마지막 학급은 삭제할 수 없습니다.");
  }

  function addStudent() {
    if (normalizeRosterNumber(studentNumber).length === 0 || studentName.trim().length === 0) {
      setMessage("학생 번호와 이름을 입력해 주세요.");
      return;
    }

    const result = actions.addStudent({
      studentNumber,
      name: studentName,
      displayName: studentDisplayName,
    });

    if (!result.ok) {
      setMessage(getStudentMutationMessage(result.reason));
      return;
    }

    setStudentNumber("");
    setStudentName("");
    setStudentDisplayName("");
    setMessage("학생을 등록했습니다.");
  }

  function downloadBackup() {
    setMessage("");
    actions.downloadBackup();
  }

  function openBackupFilePicker() {
    fileInputRef.current?.click();
  }

  function handleBackupFile(file: File | undefined) {
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = parseBackupText(String(reader.result ?? ""));

      setBackupPreview({
        fileName: file.name,
        result,
      });
      setImportConfirmed(false);
      setMessage(result.ok ? "백업 파일을 확인했습니다." : result.message);
    };
    reader.onerror = () => {
      setBackupPreview({
        fileName: file.name,
        result: { ok: false, message: "JSON 파일을 읽을 수 없습니다." },
      });
      setImportConfirmed(false);
      setMessage("JSON 파일을 읽을 수 없습니다.");
    };
    reader.readAsText(file);
  }

  function importBackup() {
    if (!backupPreview?.result.ok || !importConfirmed) {
      return;
    }

    setMessage("");
    actions.importSnapshot(backupPreview.result.snapshot);
    setBackupPreview(null);
    setImportConfirmed(false);
  }

  return (
    <div className="view-stack">
      <section className="two-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>학급 등록</h2>
              <p>새 학급을 만들면 바로 선택된 학급으로 전환됩니다.</p>
            </div>
            <Plus size={22} aria-hidden="true" />
          </div>

          <div className="form-grid">
            <label>
              학급명
              <input
                value={newClassName}
                onChange={(event) => setNewClassName(event.target.value)}
                placeholder="예: 5학년 3반"
              />
            </label>
            <label>
              학교급
              <select
                value={newClassGradeBand}
                onChange={(event) =>
                  setNewClassGradeBand(event.target.value as HomeroomClass["gradeBand"])
                }
              >
                {Object.entries(gradeBandLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button wide" type="button" onClick={createClass}>
              <Plus size={16} aria-hidden="true" />
              학급 등록
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>학급 목록</h2>
          <div className="activity-stack">
            {state.homeroomClasses.map((homeroomClass) => (
              <div
                className={
                  homeroomClass.classId === state.activeClassId
                    ? "activity-row selected"
                    : "activity-row"
                }
                key={homeroomClass.classId}
              >
                <button
                  className="text-button"
                  type="button"
                  onClick={() => actions.setActiveClassId(homeroomClass.classId)}
                >
                  <strong>{homeroomClass.name}</strong>
                  <span>
                    {gradeBandLabels[homeroomClass.gradeBand]} · {homeroomClass.students.length}명 ·{" "}
                    {homeroomClass.status === "active" ? "운영 중" : "보관"}
                  </span>
                </button>
                <div className="inline-actions">
                  <button
                    className="icon-button"
                    disabled={homeroomClass.status === "archived"}
                    type="button"
                    title="보관"
                    onClick={() => actions.archiveHomeroomClass(homeroomClass.classId)}
                  >
                    <Archive size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    title="삭제"
                    onClick={() => deleteClass(homeroomClass.classId)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="two-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>현재 학급 수정</h2>
              <p>학급 정보 변경은 기존 학생 기록을 유지합니다.</p>
            </div>
            <Save size={22} aria-hidden="true" />
          </div>

          {isClassArchived && (
            <p className="archive-notice">
              보관 학급은 이름, 학교급, 학생 명부를 읽기 전용으로 유지합니다. 다시 운영하려면
              상태를 운영 중으로 바꿔 저장해 주세요.
            </p>
          )}

          <div className="form-grid">
            <label>
              학급명
              <input
                disabled={isClassArchived}
                value={className}
                onChange={(event) => setClassName(event.target.value)}
              />
            </label>
            <label>
              학교급
              <select
                disabled={isClassArchived}
                value={gradeBand}
                onChange={(event) => setGradeBand(event.target.value as HomeroomClass["gradeBand"])}
              >
                {Object.entries(gradeBandLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              상태
              <select
                value={classStatus}
                onChange={(event) => setClassStatus(event.target.value as HomeroomClass["status"])}
              >
                <option value="active">운영 중</option>
                <option value="archived">보관</option>
              </select>
            </label>
            <button className="primary-button wide" type="button" onClick={saveClass}>
              저장
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>학생 등록</h2>
          <div className="form-grid compact">
            <label>
              번호
              <input
                disabled={isClassArchived}
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                placeholder="예: 1"
              />
            </label>
            <label>
              이름
              <input
                disabled={isClassArchived}
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="예: 김민준"
              />
            </label>
            <label>
              표시명
              <input
                disabled={isClassArchived}
                value={studentDisplayName}
                onChange={(event) => setStudentDisplayName(event.target.value)}
                placeholder="비우면 이름을 사용합니다"
              />
            </label>
            <button
              className="primary-button wide"
              disabled={isClassArchived}
              type="button"
              onClick={addStudent}
            >
              학생 등록
            </button>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>학생 명부</h2>
            <p>번호와 표시명 수정은 기존 기록 연결을 유지합니다.</p>
          </div>
          <span className="status-chip">{state.homeroomClass.students.length}명</span>
        </div>

        {state.homeroomClass.students.length > 0 ? (
          <div className="roster-list">
            {state.homeroomClass.students.map((student) => (
              <StudentRow
                key={student.studentId}
                disabled={isClassArchived}
                student={student}
                onSave={(patch) => {
                  const result = actions.updateStudent(student.studentId, patch);

                  setMessage(
                    result.ok ? "학생 정보를 저장했습니다." : getStudentMutationMessage(result.reason),
                  );
                }}
                onDelete={() => {
                  const result = actions.deleteStudent(student.studentId);

                  setMessage(
                    result.ok ? "학생을 삭제했습니다." : getStudentMutationMessage(result.reason),
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <p className="empty-text">아직 등록된 학생이 없습니다.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>데이터 보관</h2>
            <p>이 브라우저 자동 저장과 JSON 파일 백업을 함께 사용할 수 있습니다.</p>
          </div>
          <Database size={22} aria-hidden="true" />
        </div>

        <div className="storage-metrics" aria-label="저장 데이터 요약">
          <div>
            <span>자동 저장</span>
            <strong>{state.persistence.status === "error" ? "확인 필요" : "사용 중"}</strong>
          </div>
          <div>
            <span>마지막 저장</span>
            <strong>{formatDateTime(state.persistence.lastSavedAt)}</strong>
          </div>
          <div>
            <span>학급</span>
            <strong>{state.persistence.summary.classCount}개</strong>
          </div>
          <div>
            <span>학생</span>
            <strong>{state.persistence.summary.studentCount}명</strong>
          </div>
        </div>

        <div className="button-row storage-actions">
          <button className="primary-button" type="button" onClick={downloadBackup}>
            <Download size={16} aria-hidden="true" />
            JSON 백업 다운로드
          </button>
          <button className="secondary-button" type="button" onClick={openBackupFilePicker}>
            <Upload size={16} aria-hidden="true" />
            JSON 백업 가져오기
          </button>
          <input
            ref={fileInputRef}
            accept="application/json,.json"
            aria-label="JSON 백업 파일"
            className="visually-hidden"
            type="file"
            onChange={(event) => {
              handleBackupFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>

        {backupPreview && (
          <div className={backupPreview.result.ok ? "backup-preview" : "backup-preview error"}>
            <div className="panel-heading compact-heading">
              <div>
                <h3>{backupPreview.fileName}</h3>
                <p>
                  {backupPreview.result.ok
                    ? "가져오기 전에 백업 내용을 확인해 주세요."
                    : backupPreview.result.message}
                </p>
              </div>
            </div>

            {backupPreview.result.ok && (
              <>
                <div className="storage-metrics compact">
                  <div>
                    <span>내보낸 시각</span>
                    <strong>{formatDateTime(backupPreview.result.summary.exportedAt)}</strong>
                  </div>
                  <div>
                    <span>학급</span>
                    <strong>{backupPreview.result.summary.classCount}개</strong>
                  </div>
                  <div>
                    <span>학생</span>
                    <strong>{backupPreview.result.summary.studentCount}명</strong>
                  </div>
                  <div>
                    <span>칭찬</span>
                    <strong>{backupPreview.result.summary.praiseCount}건</strong>
                  </div>
                  <div>
                    <span>안건</span>
                    <strong>{backupPreview.result.summary.agendaCount}건</strong>
                  </div>
                  <div>
                    <span>규칙 후보</span>
                    <strong>{backupPreview.result.summary.ruleCandidateCount}개</strong>
                  </div>
                  <div>
                    <span>학급 약속</span>
                    <strong>{backupPreview.result.summary.classroomRuleCount}개</strong>
                  </div>
                  <div>
                    <span>참여 활동</span>
                    <strong>{backupPreview.result.summary.activityCount}개</strong>
                  </div>
                </div>

                <label className="checkbox-row">
                  <input
                    checked={importConfirmed}
                    type="checkbox"
                    onChange={(event) => setImportConfirmed(event.target.checked)}
                  />
                  현재 데이터를 백업 파일로 교체합니다.
                </label>
                <button
                  className="primary-button wide"
                  disabled={!importConfirmed}
                  type="button"
                  onClick={importBackup}
                >
                  가져오기 실행
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {visibleMessage && (
        <p className="student-message" role="status">
          {visibleMessage}
        </p>
      )}
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "아직 없음";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StudentRow({
  student,
  disabled,
  onSave,
  onDelete,
}: {
  student: Student;
  disabled: boolean;
  onSave: (patch: Partial<Pick<Student, "studentNumber" | "name" | "displayName">>) => void;
  onDelete: () => void;
}) {
  const [studentNumber, setStudentNumber] = useState(student.studentNumber);
  const [name, setName] = useState(student.name);
  const [displayName, setDisplayName] = useState(student.displayName);

  useEffect(() => {
    setStudentNumber(student.studentNumber);
    setName(student.name);
    setDisplayName(student.displayName);
  }, [student]);

  return (
    <article className="roster-row">
      <label>
        번호
        <input
          disabled={disabled}
          value={studentNumber}
          onChange={(event) => setStudentNumber(event.target.value)}
        />
      </label>
      <label>
        이름
        <input disabled={disabled} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        표시명
        <input
          disabled={disabled}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          className="secondary-button"
          disabled={disabled}
          type="button"
          onClick={() => onSave({ studentNumber, name, displayName })}
        >
          저장
        </button>
        <button
          className="secondary-button danger-button"
          disabled={disabled}
          type="button"
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function getStudentMutationMessage(reason: "classArchived" | "duplicateNumber" | "invalidInput") {
  if (reason === "classArchived") {
    return "보관 학급은 학생 명부를 수정할 수 없습니다.";
  }

  if (reason === "duplicateNumber") {
    return "이미 사용 중인 학생 번호입니다.";
  }

  return "학생 번호와 이름을 확인해 주세요.";
}
