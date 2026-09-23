import type { WeekDayPlan } from "./types";

export interface AppConfig {
  demoMode: boolean;
  officialApproved: boolean;
  appName: string;
  churchName: string;
  todayIndex: number;
  phaseLabels: {
    before: string;
    after: string;
  };
  heroTitle: string;
  heroDescription: string;
  verse: {
    text: string;
    reference: string;
  };
  practiceOptions: string[];
  weekDays: WeekDayPlan[];
  movementNotices: Array<{ label: string; value: string }>;
  onlineNoticeTitle: string;
  onlineNoticeBody: string;
  exampleNotice: string;
}

const DEFAULT_WEEK_DAYS: WeekDayPlan[] = [
  { index: 0, dayLabel: "월", theme: "하나님이 시작하신 일" },
  { index: 1, dayLabel: "화", theme: "기다림 속의 믿음" },
  { index: 2, dayLabel: "수", theme: "다시 사랑할 용기" },
  { index: 3, dayLabel: "목", theme: "끝까지 이루시는 하나님" },
  { index: 4, dayLabel: "금", theme: "삶으로 드리는 예배" },
  { index: 5, dayLabel: "토", theme: "함께 걷는 공동체" },
];

export const defaultAppConfig: AppConfig = {
  demoMode: true,
  officialApproved: false,
  appName: "특새 현장판",
  churchName: "분당우리교회",
  todayIndex: 3,
  phaseLabels: {
    before: "예배 전 예시 04:17",
    after: "예배 후 예시 06:12",
  },
  heroTitle: "오늘 예배드릴 곳을 확인하세요.",
  heroDescription:
    "좌석 수 대신 장소 담당자가 확인한 상태를 안내합니다. 숫자와 상태는 데모 예시이며 실제 공식 안내판이 우선입니다.",
  verse: {
    text: "너희 안에서 착한 일을 시작하신 이가 이루실 줄을 우리는 확신하노라.",
    reference: "빌립보서 1:6",
  },
  practiceOptions: [
    "점심 전에 빌립보서 1장을 다시 읽기",
    "떠오르는 한 사람에게 안부 보내기",
    "잠들기 전 감사한 일 세 가지 적기",
  ],
  weekDays: DEFAULT_WEEK_DAYS,
  movementNotices: [
    { label: "문 개방", value: "정문과 후문을 모두 사용하실 수 있습니다." },
    {
      label: "주차",
      value: "송림 주차장이 붐비면 드림센터 주차장을 이용해 주세요.",
    },
    { label: "아이 동반", value: "드림센터 자모실을 이용하실 수 있습니다." },
    {
      label: "중간 출차",
      value: "예배 중 출차는 체육관 주차장이 더 편합니다.",
    },
  ],
  onlineNoticeTitle: "온라인 예배도 같은 자리입니다",
  onlineNoticeBody:
    "입원, 간병, 돌봄, 해외 체류 중이라면 온라인으로 함께 예배드릴 수 있습니다. 온라인 참석도 동일하게 표시됩니다.",
  exampleNotice: "데모 모드에서는 모든 숫자와 상태가 예시입니다.",
};

function mergeConfig(partial: Partial<AppConfig>): AppConfig {
  return {
    ...defaultAppConfig,
    ...partial,
    phaseLabels: {
      ...defaultAppConfig.phaseLabels,
      ...partial.phaseLabels,
    },
    verse: {
      ...defaultAppConfig.verse,
      ...partial.verse,
    },
    weekDays:
      partial.weekDays?.length === defaultAppConfig.weekDays.length
        ? partial.weekDays
        : defaultAppConfig.weekDays,
    movementNotices:
      partial.movementNotices?.length && partial.movementNotices.length > 0
        ? partial.movementNotices
        : defaultAppConfig.movementNotices,
    practiceOptions:
      partial.practiceOptions?.length && partial.practiceOptions.length > 0
        ? partial.practiceOptions
        : defaultAppConfig.practiceOptions,
  };
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const response = await fetch("/app-config.json", { cache: "no-store" });
    if (!response.ok) {
      return defaultAppConfig;
    }

    const parsed = (await response.json()) as Partial<AppConfig>;
    return mergeConfig(parsed);
  } catch {
    return defaultAppConfig;
  }
}
