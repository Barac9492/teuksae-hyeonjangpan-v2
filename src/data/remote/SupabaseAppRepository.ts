import type { AppConfig } from "../../domain/config";
import type {
  AppSnapshot,
  Attendance,
  MomentDraft,
  OperatorLog,
  VenueId,
  VenueState,
} from "../../domain/types";
import type { AppRepository } from "../AppRepository";
import { LocalAppRepository } from "../LocalAppRepository";
import {
  enqueueAttendance,
  readAttendanceQueue,
  removeAttendanceMutation,
} from "./attendanceQueue";
import type {
  AttendanceMutation,
  MomentSubmission,
  OperatorSession,
  PublicSnapshotResponse,
  RemoteDataGateway,
  RepositoryStatus,
} from "./types";
import { isNetworkFailure, mapPublicSnapshot } from "./types";

const CACHE_KEY = "teuksae-app-v1-remote-snapshot";
const POLL_MS = 15_000;

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `request-${Date.now()}-${Math.random()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readCachedSnapshot(storage: Storage): PublicSnapshotResponse | null {
  try {
    return JSON.parse(
      storage.getItem(CACHE_KEY) ?? "null",
    ) as PublicSnapshotResponse | null;
  } catch {
    return null;
  }
}

export class SupabaseAppRepository implements AppRepository {
  readonly mode = "remote" as const;
  readonly capabilities = {
    crossTabSync: true,
    operatorWrites: true,
    momentUploadConnected: true,
    remoteSync: true,
  };

  private readonly local: LocalAppRepository;
  private snapshot: AppSnapshot;
  private remoteMeta: Pick<
    PublicSnapshotResponse,
    "event_id" | "day_key"
  > | null = null;
  private status: RepositoryStatus = {
    phase: "connecting",
    queuedMutations: 0,
  };
  private operator: OperatorSession = { access: "checking" };
  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>();
  private readonly statusListeners = new Set<
    (status: RepositoryStatus) => void
  >();
  private attendanceOperations: Promise<void> = Promise.resolve();
  private destroyed = false;
  private poll?: number;
  private unsubscribeRealtime?: () => void;
  private readonly unsubscribeLocal: () => void;

  constructor(
    config: AppConfig,
    private readonly gateway: RemoteDataGateway,
    private readonly storage: Storage = window.localStorage,
  ) {
    this.local = new LocalAppRepository(config, storage);
    this.snapshot = this.local.getSnapshot();

    const cache = readCachedSnapshot(storage);
    if (cache) {
      this.applyRemote(cache);
    }
    this.status.queuedMutations = readAttendanceQueue(storage).length;

    this.unsubscribeLocal = this.local.subscribe((localSnapshot) => {
      this.snapshot = {
        ...this.snapshot,
        practice: localSnapshot.practice,
        moments: localSnapshot.moments,
        weekDays: localSnapshot.weekDays,
      };
      this.emit();
    });

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleReconnect);
    }
    void this.bootstrap();
  }

  getSnapshot(): AppSnapshot {
    return clone(this.snapshot);
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getStatus(): RepositoryStatus {
    return { ...this.status };
  }

  subscribeStatus(listener: (status: RepositoryStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  setPracticeAction(value: string): void {
    this.local.setPracticeAction(value);
  }

  togglePracticeCompleted(index: number): void {
    this.local.togglePracticeCompleted(index);
  }

  setWordNote(value: string): void {
    this.local.setWordNote(value);
  }

  setPrayerNote(value: string): void {
    this.local.setPrayerNote(value);
  }

  addMomentDraft(value: MomentDraft): void {
    this.local.addMomentDraft(value);
  }

  setAttendanceToday(next: boolean): Promise<void> {
    return this.serializeAttendance(async () => {
      await this.replay();
      await this.mutateAttendance({ today: next });
    });
  }

  setTomorrowAttendance(next: boolean): Promise<void> {
    return this.serializeAttendance(async () => {
      await this.replay();
      await this.mutateAttendance({ tomorrow: next });
    });
  }

  selectVenue(selectedVenue: VenueId | null): Promise<void> {
    return this.serializeAttendance(async () => {
      await this.replay();
      await this.mutateAttendance({ selectedVenue });
    });
  }

  async uploadMoment(file: File, draft: MomentDraft): Promise<void> {
    this.setStatus("syncing", "파일을 안전하게 업로드하고 있습니다.");
    try {
      await this.gateway.ensureAnonymousAuth();
      await this.gateway.uploadMoment(file, draft);
      this.setStatus("connected");
    } catch (error) {
      this.setStatus("error", "파일을 올리지 못했습니다. 다시 시도해 주세요.");
      throw error;
    }
  }

  async setVenueState(
    venueId: VenueId,
    next: VenueState,
    updatedBy: string,
  ): Promise<OperatorLog> {
    void updatedBy;
    if (
      this.operator.access !== "operator" ||
      (this.status.phase !== "connected" && this.status.phase !== "syncing")
    ) {
      throw new Error("공유 상태를 변경할 운영 권한이나 연결이 없습니다.");
    }

    this.setStatus("syncing");
    try {
      const log = await this.gateway.setVenueState(
        venueId,
        next,
        generateRequestId(),
      );
      await this.refreshSnapshot();
      this.snapshot.operatorLogs = [
        log,
        ...this.snapshot.operatorLogs.filter((item) => item.id !== log.id),
      ];
      this.emit();
      this.setStatus("connected");
      return log;
    } catch (error) {
      this.setStatus("error", "공유 장소 상태는 변경되지 않았습니다.");
      throw error;
    }
  }

  getOperatorSession(): OperatorSession {
    return { ...this.operator };
  }

  async refreshOperatorSession(): Promise<OperatorSession> {
    try {
      this.operator = await this.gateway.getOperatorSession();
      if (this.operator.access === "operator") {
        this.snapshot.operatorLogs = await this.gateway.fetchOperatorLogs();
      }
    } catch {
      this.operator = { access: "denied" };
    }
    this.emit();
    return this.getOperatorSession();
  }

  async sendMagicLink(email: string): Promise<void> {
    await this.gateway.sendMagicLink(email.trim());
  }

  async signOutOperator(): Promise<void> {
    await this.gateway.signOut();
    this.operator = { access: "logged_out" };
    this.emit();
  }

  async listPendingMoments(): Promise<MomentSubmission[]> {
    if (this.operator.access !== "operator") {
      throw new Error("운영자만 검수할 수 있습니다.");
    }
    return this.gateway.listPendingMoments();
  }

  async createMomentPreview(path: string): Promise<string> {
    if (this.operator.access !== "operator") {
      throw new Error("운영자만 미리 볼 수 있습니다.");
    }
    return this.gateway.createMomentPreview(path);
  }

  async reviewMoment(
    momentId: string,
    status: "approved" | "rejected",
    note: string,
  ): Promise<void> {
    if (this.operator.access !== "operator") {
      throw new Error("운영자만 검수할 수 있습니다.");
    }
    await this.gateway.reviewMoment(momentId, status, note);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    if (this.poll) {
      window.clearInterval(this.poll);
    }
    this.unsubscribeRealtime?.();
    this.unsubscribeLocal();
    this.local.destroy();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleReconnect);
    }
  }

  private handleReconnect = (): void => {
    void (async () => {
      try {
        this.setStatus("syncing", "대기 중인 변경을 다시 전송하고 있습니다.");
        await this.refreshSnapshot();
        await this.serializeAttendance(() => this.replay());
        this.setStatus("connected");
      } catch {
        this.setStatus(
          "offline",
          "연결을 복구하지 못했습니다. 공유 상태는 변경되지 않았습니다.",
        );
      }
    })();
  };

  private async bootstrap(): Promise<void> {
    try {
      // Public snapshot intentionally runs without creating an anonymous user.
      await this.refreshSnapshot();
      await this.refreshOperatorSession();
      if (readAttendanceQueue(this.storage).length > 0) {
        await this.serializeAttendance(() => this.replay());
      }
      if (this.destroyed) {
        return;
      }
      this.unsubscribeRealtime = this.gateway.subscribeToVenues(() => {
        void this.refreshSnapshot().catch(() => {
          this.setStatus("error", "공유 안내를 새로 받지 못했습니다.");
        });
      });
      this.poll = window.setInterval(() => {
        void this.refreshSnapshot().catch(() => undefined);
      }, POLL_MS);
      this.setStatus("connected");
    } catch {
      this.setStatus(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "error",
        "마지막으로 받은 안내를 표시합니다. 공유 상태는 변경되지 않습니다.",
      );
    }
  }

  private async refreshSnapshot(): Promise<void> {
    const remote = await this.gateway.fetchSnapshot();
    this.applyRemote(remote);
    this.storage.setItem(CACHE_KEY, JSON.stringify(remote));
  }

  private applyRemote(remote: PublicSnapshotResponse): void {
    this.remoteMeta = {
      event_id: remote.event_id,
      day_key: remote.day_key,
    };
    this.status.officialApproved = remote.official_approved === true;
    this.snapshot = mapPublicSnapshot(remote, this.local.getSnapshot());
    this.emit();
    this.notifyStatusListeners();
  }

  private serializeAttendance(operation: () => Promise<void>): Promise<void> {
    const scheduled = this.attendanceOperations.then(operation, operation);
    this.attendanceOperations = scheduled.catch(() => undefined);
    return scheduled;
  }

  private async mutateAttendance(
    patch: Partial<
      Pick<AttendanceMutation, "today" | "tomorrow" | "selectedVenue">
    >,
  ): Promise<void> {
    if (!this.remoteMeta) {
      this.setStatus("error", "공유 행사 정보를 아직 받지 못했습니다.");
      throw new Error("공유 행사 정보를 아직 받지 못했습니다.");
    }

    const previousAttendance: Attendance = clone(this.snapshot.attendance);
    const mutation: AttendanceMutation = {
      id: generateRequestId(),
      eventId: this.remoteMeta.event_id,
      dayKey: this.remoteMeta.day_key,
      today: patch.today ?? previousAttendance.today,
      tomorrow: patch.tomorrow ?? previousAttendance.tomorrow,
      selectedVenue:
        patch.selectedVenue !== undefined
          ? patch.selectedVenue
          : previousAttendance.selectedVenue,
      createdAt: new Date().toISOString(),
    };

    this.snapshot.attendance = {
      ...previousAttendance,
      today: mutation.today,
      tomorrow: mutation.tomorrow,
      selectedVenue: mutation.selectedVenue,
    };
    this.emit();
    this.setStatus("syncing");

    try {
      await this.gateway.ensureAnonymousAuth();
      const remote = await this.gateway.setAttendance(mutation);
      this.applyRemote(remote);
      this.setStatus("connected");
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueAttendance(this.storage, mutation);
        this.setStatus(
          "offline",
          "참석 변경을 기기에 보관했습니다. 연결되면 다시 전송합니다.",
        );
        return;
      }

      this.snapshot.attendance = previousAttendance;
      this.emit();
      this.setStatus("error", "참석 변경이 거부되어 이전 상태로 되돌렸습니다.");
      throw error;
    }
  }

  private async replay(): Promise<void> {
    const current = this.remoteMeta;
    if (!current) {
      return;
    }

    const queued = readAttendanceQueue(this.storage);
    const currentMutations = queued.filter((mutation) => {
      const stale =
        mutation.eventId !== current.event_id ||
        mutation.dayKey !== current.day_key;
      if (stale) {
        removeAttendanceMutation(this.storage, mutation.id);
      }
      return !stale;
    });

    if (currentMutations.length === 0) {
      this.notifyStatusListeners();
      return;
    }

    await this.gateway.ensureAnonymousAuth();
    for (const mutation of currentMutations) {
      try {
        const remote = await this.gateway.setAttendance(mutation);
        removeAttendanceMutation(this.storage, mutation.id);
        this.applyRemote(remote);
      } catch (error) {
        if (isNetworkFailure(error)) {
          break;
        }
        // A queued mutation that the server rejects must not block later valid work.
        removeAttendanceMutation(this.storage, mutation.id);
      }
    }
    this.notifyStatusListeners();
  }

  private setStatus(phase: RepositoryStatus["phase"], message?: string): void {
    this.status = {
      phase,
      message,
      queuedMutations: readAttendanceQueue(this.storage).length,
      officialApproved: this.status.officialApproved === true,
    };
    this.notifyStatusListeners();
  }

  private notifyStatusListeners(): void {
    this.status.queuedMutations = readAttendanceQueue(this.storage).length;
    for (const listener of this.statusListeners) {
      listener(this.getStatus());
    }
  }

  private emit(): void {
    const value = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(value);
    }
  }
}
