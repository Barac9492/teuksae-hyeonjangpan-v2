import type { AppConfig } from "../domain/config";
import type {
  AppSnapshot,
  Attendance,
  MomentDraft,
  OperatorLog,
  PersonalPractice,
  PublicCounts,
  VenueId,
  VenueState,
  VenueStatus,
  WeekDayPlan,
} from "../domain/types";
import type { AppRepository } from "./AppRepository";
import type { RepositoryStatus } from "./remote/types";
import { createSeedSnapshot } from "./seed";

const STORAGE_KEY = "teuksae-app-v1-snapshot";
const STORAGE_VERSION = 1;
const CHANNEL_NAME = "teuksae-app-v1-channel";

interface PersistedPayload {
  version: number;
  snapshot: AppSnapshot;
}

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AppSnapshot;
}

function isVenueId(value: unknown): value is VenueId {
  return (
    value === "songrim" ||
    value === "dream" ||
    value === "gym" ||
    value === "online"
  );
}

function isVenueState(value: unknown): value is VenueState {
  return (
    value === "preparing" ||
    value === "open" ||
    value === "recommended" ||
    value === "busy" ||
    value === "full" ||
    value === "checking"
  );
}

function isAttendance(value: unknown): value is Attendance {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Attendance;
  return (
    typeof candidate.today === "boolean" &&
    typeof candidate.tomorrow === "boolean" &&
    (candidate.selectedVenue === null || isVenueId(candidate.selectedVenue)) &&
    Array.isArray(candidate.attendanceDayIndexes)
  );
}

function isPractice(value: unknown): value is PersonalPractice {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as PersonalPractice;
  return (
    typeof candidate.selectedAction === "string" &&
    Array.isArray(candidate.completedDayIndexes) &&
    typeof candidate.wordNote === "string" &&
    typeof candidate.prayerNote === "string"
  );
}

function isVenueStatus(value: unknown): value is VenueStatus {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as VenueStatus;
  return (
    isVenueId(candidate.id) &&
    typeof candidate.name === "string" &&
    isVenueState(candidate.state) &&
    typeof candidate.description === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.updatedBy === "string"
  );
}

function isOperatorLog(value: unknown): value is OperatorLog {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as OperatorLog;
  return (
    typeof candidate.id === "string" &&
    isVenueId(candidate.venueId) &&
    isVenueState(candidate.before) &&
    isVenueState(candidate.after) &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.updatedBy === "string"
  );
}

function isMomentDraft(value: unknown): value is MomentDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as MomentDraft;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.fileName === "string" &&
    typeof candidate.mediaType === "string" &&
    typeof candidate.size === "number" &&
    candidate.status === "pending_review" &&
    typeof candidate.createdAt === "string"
  );
}

function isPublicCounts(value: unknown): value is PublicCounts {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as PublicCounts;
  return (
    typeof candidate.todayTotal === "number" &&
    typeof candidate.onsiteTotal === "number" &&
    typeof candidate.onlineTotal === "number" &&
    typeof candidate.unselectedTotal === "number" &&
    typeof candidate.tomorrowTotal === "number"
  );
}

function isWeekDays(value: unknown): value is WeekDayPlan[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as WeekDayPlan).index === "number" &&
      typeof (item as WeekDayPlan).dayLabel === "string" &&
      typeof (item as WeekDayPlan).theme === "string",
  );
}

function isAppSnapshot(value: unknown): value is AppSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as AppSnapshot;
  return (
    isPublicCounts(candidate.publicCounts) &&
    Array.isArray(candidate.venues) &&
    candidate.venues.every((venue) => isVenueStatus(venue)) &&
    isAttendance(candidate.attendance) &&
    isPractice(candidate.practice) &&
    Array.isArray(candidate.moments) &&
    candidate.moments.every((moment) => isMomentDraft(moment)) &&
    Array.isArray(candidate.operatorLogs) &&
    candidate.operatorLogs.every((log) => isOperatorLog(log)) &&
    isWeekDays(candidate.weekDays)
  );
}

function parsePersistedSnapshot(rawValue: string | null): AppSnapshot | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PersistedPayload;
    if (parsed.version !== STORAGE_VERSION || !isAppSnapshot(parsed.snapshot)) {
      return null;
    }
    return parsed.snapshot;
  } catch {
    return null;
  }
}

export class LocalAppRepository implements AppRepository {
  readonly mode = "local" as const;
  readonly capabilities = {
    crossTabSync: typeof BroadcastChannel !== "undefined",
    operatorWrites: true,
    momentUploadConnected: false,
    remoteSync: false,
  };

  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>();
  private readonly channel: BroadcastChannel | null;
  private snapshot: AppSnapshot;

  constructor(
    private readonly config: AppConfig,
    private readonly storage: Storage = window.localStorage,
  ) {
    const persisted = parsePersistedSnapshot(this.storage.getItem(STORAGE_KEY));
    this.snapshot = persisted ?? createSeedSnapshot(config);

    if (!persisted) {
      this.persist();
    }

    this.channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (isAppSnapshot(event.data)) {
          this.snapshot = cloneSnapshot(event.data);
          this.emit();
        }
      };
    }

    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.handleStorageEvent);
    }
  }

  destroy(): void {
    this.channel?.close();
    this.listeners.clear();
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.handleStorageEvent);
    }
  }

  getStatus(): RepositoryStatus {
    return { phase: "local", queuedMutations: 0 };
  }

  subscribeStatus(listener: (status: RepositoryStatus) => void): () => void {
    listener(this.getStatus());
    return () => undefined;
  }

  getSnapshot(): AppSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setAttendanceToday(next: boolean): void {
    if (this.snapshot.attendance.today === next) {
      return;
    }

    const nextSnapshot = this.getSnapshot();
    nextSnapshot.attendance.today = next;
    this.applyTodayCountDelta(nextSnapshot, next ? 1 : -1);
    this.updateDayIndex(
      nextSnapshot.attendance.attendanceDayIndexes,
      this.config.todayIndex,
      next,
    );
    this.commit(nextSnapshot);
  }

  setTomorrowAttendance(next: boolean): void {
    if (this.snapshot.attendance.tomorrow === next) {
      return;
    }
    const nextSnapshot = this.getSnapshot();
    nextSnapshot.attendance.tomorrow = next;
    nextSnapshot.publicCounts.tomorrowTotal = Math.max(
      0,
      nextSnapshot.publicCounts.tomorrowTotal + (next ? 1 : -1),
    );
    this.commit(nextSnapshot);
  }

  selectVenue(venueId: VenueId | null): void {
    if (this.snapshot.attendance.selectedVenue === venueId) {
      return;
    }
    const nextSnapshot = this.getSnapshot();
    const previousVenue = nextSnapshot.attendance.selectedVenue;
    nextSnapshot.attendance.selectedVenue = venueId;

    if (nextSnapshot.attendance.today) {
      this.applyLocationCountDelta(nextSnapshot, previousVenue, -1);
      this.applyLocationCountDelta(nextSnapshot, venueId, 1);
    }

    this.commit(nextSnapshot);
  }

  setPracticeAction(action: string): void {
    const nextSnapshot = this.getSnapshot();
    nextSnapshot.practice.selectedAction = action.trim();
    this.commit(nextSnapshot);
  }

  togglePracticeCompleted(dayIndex: number): void {
    const nextSnapshot = this.getSnapshot();
    const existing =
      nextSnapshot.practice.completedDayIndexes.includes(dayIndex);
    this.updateDayIndex(
      nextSnapshot.practice.completedDayIndexes,
      dayIndex,
      !existing,
    );
    this.commit(nextSnapshot);
  }

  setWordNote(note: string): void {
    const nextSnapshot = this.getSnapshot();
    nextSnapshot.practice.wordNote = note;
    this.commit(nextSnapshot);
  }

  setPrayerNote(note: string): void {
    const nextSnapshot = this.getSnapshot();
    nextSnapshot.practice.prayerNote = note;
    this.commit(nextSnapshot);
  }

  addMomentDraft(draft: MomentDraft): void {
    const nextSnapshot = this.getSnapshot();
    nextSnapshot.moments = [draft, ...nextSnapshot.moments];
    this.commit(nextSnapshot);
  }

  setVenueState(
    venueId: VenueId,
    next: VenueState,
    updatedBy: string,
  ): OperatorLog {
    const nextSnapshot = this.getSnapshot();
    const venue = nextSnapshot.venues.find((item) => item.id === venueId);
    if (!venue) {
      throw new Error(`알 수 없는 장소: ${venueId}`);
    }

    const log: OperatorLog = {
      id: generateId(),
      venueId,
      before: venue.state,
      after: next,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    venue.state = next;
    venue.updatedAt = log.updatedAt;
    venue.updatedBy = updatedBy;
    nextSnapshot.operatorLogs = [log, ...nextSnapshot.operatorLogs];
    this.commit(nextSnapshot);
    return log;
  }

  private applyTodayCountDelta(nextSnapshot: AppSnapshot, delta: number): void {
    nextSnapshot.publicCounts.todayTotal = Math.max(
      0,
      nextSnapshot.publicCounts.todayTotal + delta,
    );
    this.applyLocationCountDelta(
      nextSnapshot,
      nextSnapshot.attendance.selectedVenue,
      delta,
    );
  }

  private applyLocationCountDelta(
    nextSnapshot: AppSnapshot,
    venueId: VenueId | null,
    delta: number,
  ): void {
    const key =
      venueId === null
        ? "unselectedTotal"
        : venueId === "online"
          ? "onlineTotal"
          : "onsiteTotal";
    nextSnapshot.publicCounts[key] = Math.max(
      0,
      nextSnapshot.publicCounts[key] + delta,
    );
  }

  private updateDayIndex(
    list: number[],
    dayIndex: number,
    include: boolean,
  ): void {
    const hasIndex = list.includes(dayIndex);
    if (include && !hasIndex) {
      list.push(dayIndex);
      list.sort((a, b) => a - b);
      return;
    }
    if (!include && hasIndex) {
      const next = list.filter((value) => value !== dayIndex);
      list.splice(0, list.length, ...next);
    }
  }

  private commit(snapshot: AppSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    this.persist();
    if (this.channel) {
      this.channel.postMessage(this.snapshot);
    }
    this.emit();
  }

  private emit(): void {
    const current = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(current);
    }
  }

  private persist(): void {
    const payload: PersistedPayload = {
      version: STORAGE_VERSION,
      snapshot: this.snapshot,
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) {
      return;
    }
    const parsed = parsePersistedSnapshot(event.newValue);
    if (!parsed) {
      this.snapshot = createSeedSnapshot(this.config);
      this.persist();
      this.emit();
      return;
    }
    this.snapshot = cloneSnapshot(parsed);
    this.emit();
  };
}

export const localStorageKey = STORAGE_KEY;
