import type {
  AppSnapshot,
  MomentDraft,
  OperatorLog,
  VenueId,
  VenueState,
} from "../domain/types";
import type {
  MomentSubmission,
  OperatorSession,
  RepositoryStatus,
} from "./remote/types";

export interface RepositoryCapabilities {
  crossTabSync: boolean;
  operatorWrites: boolean;
  momentUploadConnected: boolean;
  remoteSync: boolean;
}
export interface AppRepository {
  readonly mode: "local" | "remote";
  readonly capabilities: RepositoryCapabilities;
  getSnapshot(): AppSnapshot;
  subscribe(listener: (snapshot: AppSnapshot) => void): () => void;
  getStatus(): RepositoryStatus;
  subscribeStatus(listener: (status: RepositoryStatus) => void): () => void;
  setAttendanceToday(next: boolean): void | Promise<void>;
  setTomorrowAttendance(next: boolean): void | Promise<void>;
  selectVenue(venueId: VenueId | null): void | Promise<void>;
  setPracticeAction(action: string): void;
  togglePracticeCompleted(dayIndex: number): void;
  setWordNote(note: string): void;
  setPrayerNote(note: string): void;
  addMomentDraft(draft: MomentDraft): void;
  uploadMoment?(file: File, draft: MomentDraft): Promise<void>;
  setVenueState(
    venueId: VenueId,
    next: VenueState,
    updatedBy: string,
  ): OperatorLog | Promise<OperatorLog>;
  getOperatorSession?(): OperatorSession;
  refreshOperatorSession?(): Promise<OperatorSession>;
  sendMagicLink?(email: string): Promise<void>;
  signOutOperator?(): Promise<void>;
  listPendingMoments?(): Promise<MomentSubmission[]>;
  createMomentPreview?(path: string): Promise<string>;
  reviewMoment?(
    id: string,
    status: "approved" | "rejected",
    note: string,
  ): Promise<void>;
  destroy?(): void;
}
