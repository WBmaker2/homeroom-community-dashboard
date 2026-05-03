import { RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createSeatId,
  evaluateSeatingConflicts,
  listAvailableSeats,
  recommendSeatingPlan,
} from "../../../domain/seating";
import type { HomeroomActions, HomeroomState } from "../../../state/useHomeroomState";

type SeatingViewProps = {
  state: HomeroomState;
  actions: HomeroomActions;
  seatingPlan: ReturnType<typeof recommendSeatingPlan>;
  getStudentName: (studentId: string) => string;
};

export function SeatingView({
  state,
  actions,
  seatingPlan,
  getStudentName,
}: SeatingViewProps) {
  const defaultStudentId = state.homeroomClass.students[0]?.studentId ?? "";
  const [selectedStudentId, setSelectedStudentId] = useState(defaultStudentId);
  const [selectedSeatId, setSelectedSeatId] = useState("r1c1");
  const [frontStudentId, setFrontStudentId] = useState(defaultStudentId);
  const [separateA, setSeparateA] = useState(defaultStudentId);
  const [separateB, setSeparateB] = useState(state.homeroomClass.students[1]?.studentId ?? "");
  const availableSeats = useMemo(() => listAvailableSeats(state.seatMap), [state.seatMap]);
  const assignmentBySeat = new Map(
    seatingPlan.assignments.map((assignment) => [assignment.seatId, assignment.studentId]),
  );

  useEffect(() => {
    const firstStudentId = state.homeroomClass.students[0]?.studentId ?? "";
    const secondStudentId = state.homeroomClass.students[1]?.studentId ?? "";

    setSelectedStudentId((current) => current || firstStudentId);
    setFrontStudentId((current) => current || firstStudentId);
    setSeparateA((current) => current || firstStudentId);
    setSeparateB((current) => current || secondStudentId);
  }, [state.homeroomClass.students]);

  if (state.homeroomClass.students.length === 0) {
    return (
      <section className="panel">
        <h2>학생 명부가 비어 있습니다</h2>
        <p>학급 설정에서 학생을 먼저 등록하면 자리 배치를 만들 수 있습니다.</p>
      </section>
    );
  }

  function regenerate() {
    actions.setManualAssignments(
      recommendSeatingPlan(
        state.homeroomClass.students,
        state.seatMap,
        state.seatingConstraints,
      ).assignments,
    );
  }

  function assignSeat() {
    const seatIds = new Set(availableSeats.map((seat) => seat.seatId));

    if (!seatIds.has(selectedSeatId)) {
      return;
    }

    const baseAssignments =
      state.manualAssignments.length > 0 ? state.manualAssignments : seatingPlan.assignments;
    const nextAssignments = [
      ...baseAssignments.filter(
        (assignment) =>
          assignment.studentId !== selectedStudentId && assignment.seatId !== selectedSeatId,
      ),
      { studentId: selectedStudentId, seatId: selectedSeatId },
    ];
    const conflicts = evaluateSeatingConflicts(
      nextAssignments,
      state.seatingConstraints,
      state.seatMap,
    );

    actions.setManualAssignments(nextAssignments);

    if (conflicts.length > 0) {
      window.setTimeout(() => {
        document.getElementById("seating-conflicts")?.scrollIntoView({ block: "nearest" });
      }, 0);
    }
  }

  function toggleDisabledSeat(seatId: string) {
    actions.setSeatMap((seatMap) => {
      const disabled = new Set(seatMap.disabledSeatIds);

      if (disabled.has(seatId)) {
        disabled.delete(seatId);
      } else {
        disabled.add(seatId);
      }

      return {
        ...seatMap,
        disabledSeatIds: [...disabled],
      };
    });
    actions.setManualAssignments([]);
  }

  function addFrontCondition() {
    if (!frontStudentId) {
      return;
    }

    actions.setSeatingConstraints((constraints) => [
      ...constraints,
      {
        type: "frontPreferred",
        studentId: frontStudentId,
        frontRows: 2,
        strength: "hard",
      },
    ]);
    actions.setManualAssignments([]);
  }

  function addSeparateCondition() {
    if (!separateA || !separateB || separateA === separateB) {
      return;
    }

    actions.setSeatingConstraints((constraints) => [
      ...constraints,
      {
        type: "separateAdjacent",
        studentIds: [separateA, separateB],
        strength: "hard",
      },
    ]);
    actions.setManualAssignments([]);
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>자리 배치 시뮬레이터</h2>
            <p>추천안은 보조 자료이며, 교사가 직접 바꾼 배치를 우선 표시합니다.</p>
          </div>
          <button className="primary-button" type="button" onClick={regenerate}>
            <RefreshCcw size={16} aria-hidden="true" />
            추천 다시 만들기
          </button>
        </div>

        <div className="seating-layout">
          <div className="seat-map" aria-label="교실 좌석표">
            {Array.from({ length: state.seatMap.rows }).map((_, rowIndex) =>
              Array.from({ length: state.seatMap.columns }).map((__, columnIndex) => {
                const seatId = createSeatId(rowIndex + 1, columnIndex + 1);
                const isDisabled = state.seatMap.disabledSeatIds.includes(seatId);
                const studentId = assignmentBySeat.get(seatId);

                return (
                  <button
                    className={isDisabled ? "seat-cell disabled" : "seat-cell"}
                    key={seatId}
                    type="button"
                    onClick={() => setSelectedSeatId(seatId)}
                    onDoubleClick={() => toggleDisabledSeat(seatId)}
                  >
                    <span>{seatId}</span>
                    <strong>{isDisabled ? "미사용" : studentId ? getStudentName(studentId) : "빈자리"}</strong>
                  </button>
                );
              }),
            )}
          </div>

          <div className="control-panel">
            <label>
              학생
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
              >
                {state.homeroomClass.students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.studentNumber}. {student.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              좌석
              <select
                value={selectedSeatId}
                onChange={(event) => setSelectedSeatId(event.target.value)}
              >
                {availableSeats.map((seat) => (
                  <option key={seat.seatId} value={seat.seatId}>
                    {seat.seatId}
                  </option>
                ))}
              </select>
            </label>

            <button className="primary-button wide" type="button" onClick={assignSeat}>
              선택 좌석으로 옮기기
            </button>
          </div>
        </div>
      </section>

      <section className="two-column">
        <article className="panel">
          <h2>조건 추가</h2>
          <div className="form-grid">
            <label>
              앞자리 권장 학생
              <select value={frontStudentId} onChange={(event) => setFrontStudentId(event.target.value)}>
                {state.homeroomClass.students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={addFrontCondition}>
              앞 2줄 조건 추가
            </button>
          </div>

          <div className="form-grid compact">
            <label>
              분리 학생 1
              <select value={separateA} onChange={(event) => setSeparateA(event.target.value)}>
                {state.homeroomClass.students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              분리 학생 2
              <select value={separateB} onChange={(event) => setSeparateB(event.target.value)}>
                {state.homeroomClass.students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={addSeparateCondition}>
              분리 조건 추가
            </button>
          </div>
        </article>

        <article className="panel" id="seating-conflicts">
          <h2>충돌 설명</h2>
          {seatingPlan.conflicts.length > 0 ? (
            <ul className="plain-list">
              {seatingPlan.conflicts.map((conflict) => (
                <li key={`${conflict.message}-${conflict.severity}`}>
                  <strong>{conflict.severity === "hard" ? "강한 조건" : "약한 조건"}</strong>
                  <span>{conflict.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">현재 추천안에서 충돌한 조건이 없습니다.</p>
          )}
        </article>
      </section>
    </div>
  );
}
