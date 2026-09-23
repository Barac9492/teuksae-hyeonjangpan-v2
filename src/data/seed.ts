import type { AppConfig } from "../domain/config";
import type { AppSnapshot, OperatorLog, VenueStatus } from "../domain/types";

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `seed-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function buildSeedVenues(now: Date): VenueStatus[] {
  return [
    {
      id: "songrim",
      name: "송림 본당",
      state: "full",
      description: "송림 본당 입장은 마감입니다. 다른 장소를 확인해 주세요.",
      updatedAt: minutesAgo(now, 6),
      updatedBy: "현장 담당자",
      details: "정문은 안내 동선으로만 운영",
    },
    {
      id: "dream",
      name: "드림센터",
      state: "recommended",
      description: "지금은 자리가 여유롭고 아이 동반 이동이 편합니다.",
      updatedAt: minutesAgo(now, 3),
      updatedBy: "현장 담당자",
      details: "자모실 이용 가능",
    },
    {
      id: "gym",
      name: "체육관",
      state: "open",
      description: "경사로 입장이 가능하고 중간 출차도 상대적으로 수월합니다.",
      updatedAt: minutesAgo(now, 2),
      updatedBy: "현장 담당자",
      details: "주차 후 이동 동선 안내 중",
    },
    {
      id: "online",
      name: "온라인 예배",
      state: "recommended",
      description:
        "현장 방문이 어렵다면 온라인으로 같은 예배에 참여하실 수 있습니다.",
      updatedAt: minutesAgo(now, 1),
      updatedBy: "온라인 진행팀",
      details: "링크 준비 완료",
    },
  ];
}

function buildSeedLogs(now: Date): OperatorLog[] {
  return [
    {
      id: generateId(),
      venueId: "dream",
      before: "open",
      after: "recommended",
      updatedAt: minutesAgo(now, 3),
      updatedBy: "현장 담당자",
    },
    {
      id: generateId(),
      venueId: "songrim",
      before: "busy",
      after: "full",
      updatedAt: minutesAgo(now, 6),
      updatedBy: "현장 담당자",
    },
    {
      id: generateId(),
      venueId: "gym",
      before: "preparing",
      after: "open",
      updatedAt: minutesAgo(now, 8),
      updatedBy: "현장 담당자",
    },
  ];
}

export function createSeedSnapshot(
  config: AppConfig,
  now: Date = new Date(),
): AppSnapshot {
  return {
    publicCounts: {
      todayTotal: 2659,
      onsiteTotal: 2041,
      onlineTotal: 618,
      unselectedTotal: 0,
      tomorrowTotal: 1384,
    },
    venues: buildSeedVenues(now),
    attendance: {
      today: false,
      tomorrow: false,
      selectedVenue: null,
      attendanceDayIndexes: [0, 1, 2],
    },
    practice: {
      selectedAction: "",
      completedDayIndexes: [0, 1],
      wordNote: "",
      prayerNote: "",
    },
    moments: [],
    operatorLogs: buildSeedLogs(now),
    weekDays: config.weekDays,
  };
}
