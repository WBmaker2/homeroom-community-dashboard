import type { PraiseRecord, Student, StudentId } from "./types";

export function buildWeeklyPraiseDraft(params: {
  student: Student;
  records: PraiseRecord[];
}): string {
  const approvedRecords = params.records
    .filter(
      (record) =>
        record.studentId === params.student.studentId && record.reviewStatus === "approved",
    )
    .slice(-3);

  if (approvedRecords.length === 0) {
    return "";
  }

  const phrases = approvedRecords.map((record) => {
    const tagText = record.tags.length > 0 ? `${record.tags.join(", ")} 모습` : "좋은 모습";

    return `${tagText}으로 ${record.memo}`;
  });

  return `${params.student.displayName} 학생은 이번 주 ${phrases.join(" 또 ")} 앞으로도 주변을 살피며 함께 성장하는 모습을 기대합니다.`;
}

export function getLatestApprovedPraiseDate(
  records: PraiseRecord[],
  studentId: StudentId,
): string | null {
  const latest = records
    .filter((record) => record.studentId === studentId && record.reviewStatus === "approved")
    .map((record) => record.date)
    .sort()
    .at(-1);

  return latest ?? null;
}
