export type VenueId = "songrim" | "dream" | "gym" | "online";

export type VenueState =
  | "preparing"
  | "open"
  | "recommended"
  | "busy"
  | "full"
  | "checking";

export interface VenueStatus {
  id: VenueId;
  name: string;
  state: VenueState;
  description: string;
  updatedAt: string;
  updatedBy: string;
  details?: string;
}

export interface Attendance {
  today: boolean;
  tomorrow: boolean;
  selectedVenue: VenueId | null;
  attendanceDayIndexes: number[];
}

export interface PersonalPractice {
  selectedAction: string;
  completedDayIndexes: number[];
  wordNote: string;
  prayerNote: string;
}

export type MomentDraftStatus = "pending_review";

export interface MomentDraft {
  id: string;
  fileName: string;
  mediaType: string;
  size: number;
  status: MomentDraftStatus;
  createdAt: string;
}

export interface OperatorLog {
  id: string;
  venueId: VenueId;
  before: VenueState;
  after: VenueState;
  updatedAt: string;
  updatedBy: string;
}

export interface PublicCounts {
  todayTotal: number;
  onsiteTotal: number;
  onlineTotal: number;
  unselectedTotal: number;
  tomorrowTotal: number;
}

export interface WeekDayPlan {
  index: number;
  dayLabel: string;
  theme: string;
}

export interface AppSnapshot {
  publicCounts: PublicCounts;
  venues: VenueStatus[];
  attendance: Attendance;
  practice: PersonalPractice;
  moments: MomentDraft[];
  operatorLogs: OperatorLog[];
  weekDays: WeekDayPlan[];
}
