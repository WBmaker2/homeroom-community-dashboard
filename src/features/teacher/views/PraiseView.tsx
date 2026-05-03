import { Check, PencilLine, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildWeeklyPraiseDraft, getLatestApprovedPraiseDate } from "../../../domain/praise";
import type { PraiseRecord } from "../../../domain/types";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";

type PraiseViewProps = {
  state: HomeroomState;
  actions: HomeroomActions;
  signals: {
    praiseGapStudents: HomeroomState["homeroomClass"]["students"];
  };
  getStudentName: (studentId: string) => string;
};

export function PraiseView({ state, actions, signals, getStudentName }: PraiseViewProps) {
  const [studentId, setStudentId] = useState(state.homeroomClass.students[0]?.studentId ?? "");
  const [tag, setTag] = useState("협력");
  const [memo, setMemo] = useState("");
  const [draftStudentId, setDraftStudentId] = useState(
    state.homeroomClass.students[0]?.studentId ?? "",
  );
  const selectedDraftStudent = state.homeroomClass.students.find(
    (student) => student.studentId === draftStudentId,
  );
  const generatedDraft = useMemo(
    () =>
      selectedDraftStudent
        ? buildWeeklyPraiseDraft({
            student: selectedDraftStudent,
            records: state.praiseRecords,
          })
        : "",
    [selectedDraftStudent, state.praiseRecords],
  );
  const [editableDraft, setEditableDraft] = useState(generatedDraft);
  const pendingReports = state.praiseRecords.filter((record) => record.reviewStatus === "pending");

  useEffect(() => {
    setEditableDraft(generatedDraft || "이번 주 기록이 부족합니다. 짧은 칭찬 기록을 먼저 추가해 주세요.");
  }, [generatedDraft]);

  if (state.homeroomClass.students.length === 0) {
    return (
      <section className="panel">
        <h2>학생 명부가 비어 있습니다</h2>
        <p>학급 설정에서 학생을 먼저 등록하면 칭찬 기록을 추가할 수 있습니다.</p>
      </section>
    );
  }

  function addPraiseRecord() {
    const cleanMemo = memo.trim();

    if (!studentId || cleanMemo.length === 0) {
      return;
    }

    const nextRecord: PraiseRecord = {
      praiseId: `praise-${Date.now()}`,
      classId: state.homeroomClass.classId,
      studentId,
      date: state.todayIso,
      tags: [tag],
      memo: cleanMemo,
      visibility: "teacherOnly",
      reviewStatus: "approved",
    };

    actions.setPraiseRecords((records) => [nextRecord, ...records]);
    setMemo("");
  }

  function updateReviewStatus(praiseId: string, reviewStatus: PraiseRecord["reviewStatus"]) {
    actions.setPraiseRecords((records) =>
      records.map((record) =>
        record.praiseId === praiseId
          ? {
              ...record,
              reviewStatus,
              visibility: reviewStatus === "approved" ? "publicAfterReview" : record.visibility,
            }
          : record,
      ),
    );
  }

  return (
    <div className="view-stack">
      <section className="two-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>칭찬 기록 추가</h2>
              <p>교사 전용 긍정 기록으로 저장됩니다.</p>
            </div>
            <PencilLine size={22} aria-hidden="true" />
          </div>

          <div className="form-grid">
            <label>
              학생
              <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                {state.homeroomClass.students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.studentNumber}. {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              태그
              <select value={tag} onChange={(event) => setTag(event.target.value)}>
                <option>협력</option>
                <option>배려</option>
                <option>정리</option>
                <option>도전</option>
                <option>책임</option>
              </select>
            </label>
            <label>
              메모
              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={4}
                placeholder="관찰한 좋은 행동을 짧게 적어 주세요."
              />
            </label>
            <button className="primary-button wide" type="button" onClick={addPraiseRecord}>
              기록 추가
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>칭찬 공백</h2>
          <div className="student-chip-list">
            {signals.praiseGapStudents.map((student) => (
              <span className="student-chip" key={student.studentId}>
                {student.displayName}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="two-column">
        <article className="panel">
          <h2>학생 제보 검토</h2>
          {pendingReports.length > 0 ? (
            <div className="review-stack">
              {pendingReports.map((record) => (
                <div className="review-item" key={record.praiseId}>
                  <div>
                    <strong>{getStudentName(record.studentId)}</strong>
                    <p>{record.memo}</p>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="icon-button"
                      type="button"
                      title="승인"
                      onClick={() => updateReviewStatus(record.praiseId, "approved")}
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      title="보류"
                      onClick={() => updateReviewStatus(record.praiseId, "deferred")}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">검토 대기 중인 칭찬 제보가 없습니다.</p>
          )}
        </article>

        <article className="panel">
          <h2>주간 칭찬 문구</h2>
          <div className="form-grid">
            <label>
              학생
              <select
                value={draftStudentId}
                onChange={(event) => setDraftStudentId(event.target.value)}
              >
                {state.homeroomClass.students.map((student) => {
                  const latest = getLatestApprovedPraiseDate(
                    state.praiseRecords,
                    student.studentId,
                  );

                  return (
                    <option key={student.studentId} value={student.studentId}>
                      {student.displayName}
                      {latest ? ` · ${latest.slice(5, 10)}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <textarea
              value={editableDraft}
              onChange={(event) => setEditableDraft(event.target.value)}
              rows={6}
            />
          </div>
        </article>
      </section>
    </div>
  );
}
