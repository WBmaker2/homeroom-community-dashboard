import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  sampleActivities,
  sampleAgendaItems,
  sampleClass,
  sampleClassroomRules,
  samplePraiseRecords,
  sampleRuleCandidates,
  sampleSeatMap,
  sampleSeatingConstraints,
  sampleSubmissions,
} from "../data/sampleClass";
import {
  createHomeroomClass,
  createStudent,
  detachStudentFromAgendaItems,
  removeStudentAssignments,
  removeStudentFromConstraints,
  removeStudentPraiseRecords,
  type NewClassInput,
  type NewStudentInput,
} from "../domain/classSettings";
import { computeDashboardSignals } from "../domain/dashboardSignals";
import {
  STORAGE_KEY,
  createSnapshotPayload,
  downloadJsonBackup,
  normalizeSnapshot,
  parseStoredSnapshot,
  serializeSnapshot,
  summarizeSnapshot,
  type HomeroomDataSnapshot,
  type SnapshotSummary,
} from "../domain/persistence";
import { evaluateSeatingConflicts, recommendSeatingPlan } from "../domain/seating";
import type {
  AgendaItem,
  ClassroomRule,
  HomeroomClass,
  ParticipationActivity,
  ParticipationSubmission,
  PraiseRecord,
  RuleCandidate,
  SeatAssignment,
  SeatMap,
  SeatingConstraint,
  Student,
  StudentId,
} from "../domain/types";

export type HomeroomState = {
  homeroomClasses: HomeroomClass[];
  activeClassId: string;
  homeroomClass: HomeroomClass;
  praiseRecords: PraiseRecord[];
  agendaItems: AgendaItem[];
  ruleCandidates: RuleCandidate[];
  classroomRules: ClassroomRule[];
  activities: ParticipationActivity[];
  submissions: ParticipationSubmission[];
  seatMap: SeatMap;
  seatingConstraints: SeatingConstraint[];
  manualAssignments: SeatAssignment[];
  todayIso: string;
  persistence: {
    status: "saved" | "error" | "idle";
    message: string;
    lastSavedAt: string | null;
    summary: SnapshotSummary;
  };
};

export type HomeroomActions = {
  addHomeroomClass: (input: NewClassInput) => void;
  updateHomeroomClass: (patch: Partial<Pick<HomeroomClass, "name" | "gradeBand" | "status">>) => void;
  archiveHomeroomClass: (classId: string) => void;
  deleteHomeroomClass: (classId: string) => boolean;
  setActiveClassId: Dispatch<SetStateAction<string>>;
  addStudent: (input: NewStudentInput) => void;
  updateStudent: (studentId: StudentId, patch: Partial<Pick<Student, "studentNumber" | "name" | "displayName">>) => void;
  deleteStudent: (studentId: StudentId) => void;
  setPraiseRecords: Dispatch<SetStateAction<PraiseRecord[]>>;
  setAgendaItems: Dispatch<SetStateAction<AgendaItem[]>>;
  setRuleCandidates: Dispatch<SetStateAction<RuleCandidate[]>>;
  setClassroomRules: Dispatch<SetStateAction<ClassroomRule[]>>;
  setActivities: Dispatch<SetStateAction<ParticipationActivity[]>>;
  setSubmissions: Dispatch<SetStateAction<ParticipationSubmission[]>>;
  setSeatMap: Dispatch<SetStateAction<SeatMap>>;
  setSeatingConstraints: Dispatch<SetStateAction<SeatingConstraint[]>>;
  setManualAssignments: Dispatch<SetStateAction<SeatAssignment[]>>;
  downloadBackup: () => void;
  importSnapshot: (snapshot: HomeroomDataSnapshot) => void;
  clearPersistenceMessage: () => void;
};

export function useHomeroomState() {
  const todayIso = "2026-05-03T09:00:00+09:00";
  const [initialLoad] = useState(loadInitialSnapshot);
  const [homeroomClasses, setHomeroomClasses] = useState<HomeroomClass[]>(
    initialLoad.snapshot.homeroomClasses,
  );
  const [activeClassId, setActiveClassId] = useState(initialLoad.snapshot.activeClassId);
  const [praiseRecords, setPraiseRecords] = useState(initialLoad.snapshot.praiseRecords);
  const [agendaItems, setAgendaItems] = useState(initialLoad.snapshot.agendaItems);
  const [ruleCandidates, setRuleCandidates] = useState(initialLoad.snapshot.ruleCandidates);
  const [classroomRules, setClassroomRules] = useState(initialLoad.snapshot.classroomRules);
  const [activities, setActivities] = useState(initialLoad.snapshot.activities);
  const [submissions, setSubmissions] = useState(initialLoad.snapshot.submissions);
  const [classSeatMaps, setClassSeatMaps] = useState<Record<string, SeatMap>>({
    ...initialLoad.snapshot.classSeatMaps,
  });
  const [classSeatingConstraints, setClassSeatingConstraints] = useState<
    Record<string, SeatingConstraint[]>
  >({ ...initialLoad.snapshot.classSeatingConstraints });
  const [classManualAssignments, setClassManualAssignments] = useState<
    Record<string, SeatAssignment[]>
  >({ ...initialLoad.snapshot.classManualAssignments });
  const [persistenceState, setPersistenceState] = useState<{
    status: "saved" | "error" | "idle";
    message: string;
    lastSavedAt: string | null;
  }>({
    status: initialLoad.message ? ("error" as const) : ("idle" as const),
    message: initialLoad.message ?? "",
    lastSavedAt: initialLoad.savedAt ?? null,
  });
  const activeClass = useMemo(
    () => homeroomClasses.find((homeroomClass) => homeroomClass.classId === activeClassId) ?? homeroomClasses[0] ?? sampleClass,
    [activeClassId, homeroomClasses],
  );
  const activePraiseRecords = useMemo(
    () => praiseRecords.filter((record) => record.classId === activeClass.classId),
    [activeClass.classId, praiseRecords],
  );
  const activeAgendaItems = useMemo(
    () => agendaItems.filter((item) => item.classId === activeClass.classId),
    [activeClass.classId, agendaItems],
  );
  const activeRuleCandidates = useMemo(
    () => ruleCandidates.filter((candidate) => candidate.classId === activeClass.classId),
    [activeClass.classId, ruleCandidates],
  );
  const activeClassroomRules = useMemo(
    () => classroomRules.filter((rule) => rule.classId === activeClass.classId),
    [activeClass.classId, classroomRules],
  );
  const activeActivities = useMemo(
    () => activities.filter((activity) => activity.classId === activeClass.classId),
    [activeClass.classId, activities],
  );
  const activeSubmissions = useMemo(
    () => submissions.filter((submission) => submission.classId === activeClass.classId),
    [activeClass.classId, submissions],
  );
  const seatMap = classSeatMaps[activeClass.classId] ?? createDefaultSeatMap();
  const seatingConstraints = classSeatingConstraints[activeClass.classId] ?? [];
  const manualAssignments = classManualAssignments[activeClass.classId] ?? [];
  const fullSnapshot = useMemo<HomeroomDataSnapshot>(
    () =>
      normalizeSnapshot({
        homeroomClasses,
        activeClassId: activeClass.classId,
        praiseRecords,
        agendaItems,
        ruleCandidates,
        classroomRules,
        activities,
        submissions,
        classSeatMaps,
        classSeatingConstraints,
        classManualAssignments,
      }),
    [
      homeroomClasses,
      activeClass.classId,
      praiseRecords,
      agendaItems,
      ruleCandidates,
      classroomRules,
      activities,
      submissions,
      classSeatMaps,
      classSeatingConstraints,
      classManualAssignments,
    ],
  );
  const persistenceSummary = useMemo(() => summarizeSnapshot(fullSnapshot), [fullSnapshot]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();

        window.localStorage.setItem(
          STORAGE_KEY,
          serializeSnapshot(createSnapshotPayload({ snapshot: fullSnapshot, savedAt })),
        );
        setPersistenceState({
          status: "saved",
          message: "이 브라우저에 자동 저장 중입니다.",
          lastSavedAt: savedAt,
        });
      } catch {
        setPersistenceState((current) => ({
          ...current,
          status: "error",
          message: "자동 저장에 실패했습니다. JSON 백업을 내려받아 보관해 주세요.",
        }));
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fullSnapshot]);

  const seatingPlan = useMemo(() => {
    if (manualAssignments.length > 0) {
      const conflicts = evaluateSeatingConflicts(
        manualAssignments,
        seatingConstraints,
        seatMap,
      );

      return {
        assignments: manualAssignments,
        conflicts,
        satisfiedCount: seatingConstraints.length - conflicts.length,
      };
    }

    return recommendSeatingPlan(activeClass.students, seatMap, seatingConstraints);
  }, [activeClass.students, manualAssignments, seatMap, seatingConstraints]);

  const signals = useMemo(
    () =>
      computeDashboardSignals({
        students: activeClass.students,
        praiseRecords: activePraiseRecords,
        agendaItems: activeAgendaItems,
        ruleCandidates: activeRuleCandidates,
        classroomRules: activeClassroomRules,
        seatMap,
        seatingConstraints,
        todayIso,
      }),
    [
      activeClass.students,
      activePraiseRecords,
      activeAgendaItems,
      activeRuleCandidates,
      activeClassroomRules,
      seatMap,
      seatingConstraints,
      todayIso,
    ],
  );

  const state: HomeroomState = {
    homeroomClasses,
    activeClassId: activeClass.classId,
    homeroomClass: activeClass,
    praiseRecords: activePraiseRecords,
    agendaItems: activeAgendaItems,
    ruleCandidates: activeRuleCandidates,
    classroomRules: activeClassroomRules,
    activities: activeActivities,
    submissions: activeSubmissions,
    seatMap,
    seatingConstraints,
    manualAssignments,
    todayIso,
    persistence: {
      ...persistenceState,
      summary: persistenceSummary,
    },
  };

  const setActivePraiseRecords = createClassScopedSetter(
    setPraiseRecords,
    activeClass.classId,
  );
  const setActiveAgendaItems = createClassScopedSetter(setAgendaItems, activeClass.classId);
  const setActiveRuleCandidates = createClassScopedSetter(
    setRuleCandidates,
    activeClass.classId,
  );
  const setActiveClassroomRules = createClassScopedSetter(
    setClassroomRules,
    activeClass.classId,
  );
  const setActiveActivities = createClassScopedSetter(setActivities, activeClass.classId);
  const setActiveSubmissions = createClassScopedSetter(setSubmissions, activeClass.classId);

  const actions: HomeroomActions = {
    addHomeroomClass,
    updateHomeroomClass,
    archiveHomeroomClass,
    deleteHomeroomClass,
    setActiveClassId,
    addStudent,
    updateStudent,
    deleteStudent,
    setPraiseRecords: setActivePraiseRecords,
    setAgendaItems: setActiveAgendaItems,
    setRuleCandidates: setActiveRuleCandidates,
    setClassroomRules: setActiveClassroomRules,
    setActivities: setActiveActivities,
    setSubmissions: setActiveSubmissions,
    setSeatMap: setActiveSeatMap,
    setSeatingConstraints: setActiveSeatingConstraints,
    setManualAssignments: setActiveManualAssignments,
    downloadBackup,
    importSnapshot,
    clearPersistenceMessage,
  };

  function getStudentName(studentId: StudentId): string {
    return (
      activeClass.students.find((student) => student.studentId === studentId)?.displayName ??
      "학생"
    );
  }

  return { state, actions, seatingPlan, signals, getStudentName };

  function addHomeroomClass(input: NewClassInput) {
    if (input.name.trim().length === 0) {
      return;
    }

    const nextClass = createHomeroomClass(input, Date.now());

    setHomeroomClasses((classes) => [nextClass, ...classes]);
    setClassSeatMaps((maps) => ({ ...maps, [nextClass.classId]: createDefaultSeatMap() }));
    setClassSeatingConstraints((constraints) => ({
      ...constraints,
      [nextClass.classId]: [],
    }));
    setClassManualAssignments((assignments) => ({ ...assignments, [nextClass.classId]: [] }));
    setActiveClassId(nextClass.classId);
  }

  function updateHomeroomClass(
    patch: Partial<Pick<HomeroomClass, "name" | "gradeBand" | "status">>,
  ) {
    setHomeroomClasses((classes) =>
      classes.map((homeroomClass) =>
        homeroomClass.classId === activeClass.classId
          ? {
              ...homeroomClass,
              ...patch,
              name: patch.name?.trim() || homeroomClass.name,
            }
          : homeroomClass,
      ),
    );

    if (patch.status === "archived") {
      setActivities((items) =>
        items.map((activity) =>
          activity.classId === activeClass.classId ? { ...activity, status: "closed" } : activity,
        ),
      );
    }
  }

  function archiveHomeroomClass(classId: string) {
    setHomeroomClasses((classes) =>
      classes.map((homeroomClass) =>
        homeroomClass.classId === classId ? { ...homeroomClass, status: "archived" } : homeroomClass,
      ),
    );
    setActivities((items) =>
      items.map((activity) => (activity.classId === classId ? { ...activity, status: "closed" } : activity)),
    );
  }

  function deleteHomeroomClass(classId: string): boolean {
    if (homeroomClasses.length <= 1) {
      return false;
    }

    const nextActiveClass = homeroomClasses.find((homeroomClass) => homeroomClass.classId !== classId);

    setHomeroomClasses((classes) =>
      classes.filter((homeroomClass) => homeroomClass.classId !== classId),
    );
    setPraiseRecords((records) => records.filter((record) => record.classId !== classId));
    setAgendaItems((items) => items.filter((item) => item.classId !== classId));
    setRuleCandidates((candidates) =>
      candidates.filter((candidate) => candidate.classId !== classId),
    );
    setClassroomRules((rules) => rules.filter((rule) => rule.classId !== classId));
    setActivities((items) => items.filter((activity) => activity.classId !== classId));
    setSubmissions((items) => items.filter((submission) => submission.classId !== classId));
    setClassSeatMaps((maps) => omitKey(maps, classId));
    setClassSeatingConstraints((constraints) => omitKey(constraints, classId));
    setClassManualAssignments((assignments) => omitKey(assignments, classId));

    if (activeClass.classId === classId && nextActiveClass) {
      setActiveClassId(nextActiveClass.classId);
    }

    return true;
  }

  function addStudent(input: NewStudentInput) {
    if (input.studentNumber.trim().length === 0 || input.name.trim().length === 0) {
      return;
    }

    const nextStudent = createStudent(input, Date.now());

    setHomeroomClasses((classes) =>
      classes.map((homeroomClass) =>
        homeroomClass.classId === activeClass.classId
          ? { ...homeroomClass, students: [...homeroomClass.students, nextStudent] }
          : homeroomClass,
      ),
    );
  }

  function updateStudent(
    studentId: StudentId,
    patch: Partial<Pick<Student, "studentNumber" | "name" | "displayName">>,
  ) {
    setHomeroomClasses((classes) =>
      classes.map((homeroomClass) =>
        homeroomClass.classId === activeClass.classId
          ? {
              ...homeroomClass,
              students: homeroomClass.students.map((student) =>
                student.studentId === studentId
                  ? {
                      ...student,
                      ...patch,
                      studentNumber: patch.studentNumber?.trim() || student.studentNumber,
                      name: patch.name?.trim() || student.name,
                      displayName: patch.displayName?.trim() || student.displayName,
                    }
                  : student,
              ),
            }
          : homeroomClass,
      ),
    );
  }

  function deleteStudent(studentId: StudentId) {
    setHomeroomClasses((classes) =>
      classes.map((homeroomClass) =>
        homeroomClass.classId === activeClass.classId
          ? {
              ...homeroomClass,
              students: homeroomClass.students.filter((student) => student.studentId !== studentId),
            }
          : homeroomClass,
      ),
    );
    setClassSeatMaps((maps) => ({
      ...maps,
      [activeClass.classId]: {
        ...seatMap,
        fixedAssignments: removeStudentAssignments(seatMap.fixedAssignments, studentId),
      },
    }));
    setClassManualAssignments((assignments) => ({
      ...assignments,
      [activeClass.classId]: removeStudentAssignments(manualAssignments, studentId),
    }));
    setClassSeatingConstraints((constraints) => ({
      ...constraints,
      [activeClass.classId]: removeStudentFromConstraints(seatingConstraints, studentId),
    }));
    setPraiseRecords((records) =>
      removeStudentPraiseRecords(records, activeClass.classId, studentId),
    );
    setAgendaItems((items) =>
      detachStudentFromAgendaItems(items, activeClass.classId, studentId),
    );
    setSubmissions((items) =>
      items.filter(
        (submission) =>
          submission.classId !== activeClass.classId || submission.studentId !== studentId,
      ),
    );
  }

  function setActiveSeatMap(next: SetStateAction<SeatMap>) {
    setClassSeatMaps((maps) => {
      const current = maps[activeClass.classId] ?? createDefaultSeatMap();
      const nextSeatMap = typeof next === "function" ? next(current) : next;

      return { ...maps, [activeClass.classId]: nextSeatMap };
    });
  }

  function setActiveSeatingConstraints(next: SetStateAction<SeatingConstraint[]>) {
    setClassSeatingConstraints((constraints) => {
      const current = constraints[activeClass.classId] ?? [];
      const nextConstraints = typeof next === "function" ? next(current) : next;

      return { ...constraints, [activeClass.classId]: nextConstraints };
    });
  }

  function setActiveManualAssignments(next: SetStateAction<SeatAssignment[]>) {
    setClassManualAssignments((assignments) => {
      const current = assignments[activeClass.classId] ?? [];
      const nextAssignments = typeof next === "function" ? next(current) : next;

      return { ...assignments, [activeClass.classId]: nextAssignments };
    });
  }

  function downloadBackup() {
    try {
      downloadJsonBackup({ snapshot: fullSnapshot });
      setPersistenceState((current) => ({
        ...current,
        message: "JSON 백업 파일을 만들었습니다.",
      }));
    } catch {
      setPersistenceState((current) => ({
        ...current,
        status: "error",
        message: "JSON 백업 파일을 만들 수 없습니다.",
      }));
    }
  }

  function importSnapshot(snapshot: HomeroomDataSnapshot) {
    const nextSnapshot = normalizeSnapshot(snapshot);
    const savedAt = new Date().toISOString();

    setHomeroomClasses(nextSnapshot.homeroomClasses);
    setActiveClassId(nextSnapshot.activeClassId);
    setPraiseRecords(nextSnapshot.praiseRecords);
    setAgendaItems(nextSnapshot.agendaItems);
    setRuleCandidates(nextSnapshot.ruleCandidates);
    setClassroomRules(nextSnapshot.classroomRules);
    setActivities(nextSnapshot.activities);
    setSubmissions(nextSnapshot.submissions);
    setClassSeatMaps(nextSnapshot.classSeatMaps);
    setClassSeatingConstraints(nextSnapshot.classSeatingConstraints);
    setClassManualAssignments(nextSnapshot.classManualAssignments);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        serializeSnapshot(createSnapshotPayload({ snapshot: nextSnapshot, savedAt })),
      );
      setPersistenceState({
        status: "saved",
        message: "백업 데이터를 가져왔습니다. 이 브라우저 저장소도 함께 갱신했습니다.",
        lastSavedAt: savedAt,
      });
    } catch {
      setPersistenceState({
        status: "error",
        message: "백업 데이터는 가져왔지만 브라우저 자동 저장에 실패했습니다.",
        lastSavedAt: null,
      });
    }
  }

  function clearPersistenceMessage() {
    setPersistenceState((current) => ({ ...current, message: "" }));
  }
}

function createDefaultSeatMap(): SeatMap {
  return {
    rows: 4,
    columns: 4,
    disabledSeatIds: [],
    fixedAssignments: [],
  };
}

function createClassScopedSetter<T extends { classId: string }>(
  setGlobal: Dispatch<SetStateAction<T[]>>,
  classId: string,
): Dispatch<SetStateAction<T[]>> {
  return (next) => {
    setGlobal((globalItems) => {
      const currentClassItems = globalItems.filter((item) => item.classId === classId);
      const nextClassItems = typeof next === "function" ? next(currentClassItems) : next;
      const otherClassItems = globalItems.filter((item) => item.classId !== classId);

      return [...nextClassItems, ...otherClassItems];
    });
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;

  return rest;
}

function createSampleSnapshot(): HomeroomDataSnapshot {
  return {
    homeroomClasses: [sampleClass],
    activeClassId: sampleClass.classId,
    praiseRecords: samplePraiseRecords,
    agendaItems: sampleAgendaItems,
    ruleCandidates: sampleRuleCandidates,
    classroomRules: sampleClassroomRules,
    activities: sampleActivities,
    submissions: sampleSubmissions,
    classSeatMaps: {
      [sampleClass.classId]: sampleSeatMap,
    },
    classSeatingConstraints: {
      [sampleClass.classId]: sampleSeatingConstraints,
    },
    classManualAssignments: {
      [sampleClass.classId]: [],
    },
  };
}

function loadInitialSnapshot(): {
  snapshot: HomeroomDataSnapshot;
  message?: string;
  savedAt?: string;
} {
  const sampleSnapshot = createSampleSnapshot();

  if (typeof window === "undefined") {
    return { snapshot: sampleSnapshot };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { snapshot: sampleSnapshot };
    }

    const parsed = parseStoredSnapshot(raw);

    if (!parsed.ok) {
      return {
        snapshot: sampleSnapshot,
        message: parsed.message,
      };
    }

    return {
      snapshot: parsed.snapshot,
      savedAt: parsed.payload.savedAt,
    };
  } catch {
    return {
      snapshot: sampleSnapshot,
      message: "저장된 데이터를 읽을 수 없어 기본 데이터로 시작했습니다.",
    };
  }
}
