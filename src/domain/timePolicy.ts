export function getCurrentHomeroomIso(now = new Date()): string {
  const parts = parseKoreanDateTimeParts(now);

  return formatKoreanDateTime(parts);
}

export function formatKoreanDateLabel(isoDate: string): string {
  const parts = parseKoreanDateTimeParts(isoDate);

  return `${parts.year}년 ${parts.month}월 ${parts.day}일`;
}

export function createDefaultAgendaClosesAt(baseIso: string): string {
  return createHomeroomDate(baseIso, { days: 7, hour: 18, minute: 0, second: 0 });
}

export function createDefaultVoteClosesAt(baseIso: string): string {
  const { hour, minute, second } = parseKoreanDateTimeParts(baseIso);
  const isAfterCutoff = hour > 18 || (hour === 18 && (minute > 0 || second > 0));
  const dayOffset = isAfterCutoff ? 1 : 0;

  return createHomeroomDate(baseIso, {
    days: dayOffset,
    hour: 18,
    minute: 0,
    second: 0,
  });
}

export function createDefaultRuleCheckDate(baseIso: string): string {
  return createHomeroomDate(baseIso, { days: 7, hour: 9, minute: 0, second: 0 });
}

export function startOfHomeroomDay(isoDate: string): Date {
  return new Date(baseMidnightIso(isoDate));
}

function createHomeroomDate(
  baseIso: string,
  options: {
    days: number;
    hour: number;
    minute: number;
    second: number;
  },
): string {
  const baseDate = new Date(baseMidnightIso(baseIso));
  baseDate.setUTCDate(baseDate.getUTCDate() + options.days);
  const { year, month, day } = parseKoreanDateTimeParts(baseDate);

  return formatKoreanDateTime({
    year,
    month,
    day,
    hour: options.hour,
    minute: options.minute,
    second: options.second,
  });
}

function baseMidnightIso(isoDate: string): string {
  const parts = parseKoreanDateTimeParts(isoDate);

  return formatKoreanDateTime({
    ...parts,
    hour: 0,
    minute: 0,
    second: 0,
  });
}

type KoreanDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseKoreanDateTimeParts(dateLike: Date | string): KoreanDateTimeParts {
  const value = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const rawValues = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }

    return acc;
  }, {});

  return {
    year: Number(rawValues.year),
    month: Number(rawValues.month),
    day: Number(rawValues.day),
    hour: Number(rawValues.hour),
    minute: Number(rawValues.minute),
    second: Number(rawValues.second),
  };
}

function formatKoreanDateTime(parts: KoreanDateTimeParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}+09:00`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
