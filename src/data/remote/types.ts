import type {
  AppSnapshot,
  MomentDraft,
  OperatorLog,
  VenueId,
  VenueState,
  VenueStatus,
} from "../../domain/types";

export type ConnectionPhase =
  | "local"
  | "connecting"
  | "connected"
  | "syncing"
  | "offline"
  | "error";

export interface RepositoryStatus {
  phase: ConnectionPhase;
  queuedMutations: number;
  message?: string;
  officialApproved?: boolean;
}

export type OperatorAccess = "logged_out" | "checking" | "denied" | "operator";

export interface OperatorSession {
  access: OperatorAccess;
  email?: string;
}

export interface AttendanceMutation {
  id: string;
  eventId: string;
  dayKey: string;
  today: boolean;
  tomorrow: boolean;
  selectedVenue: VenueId | null;
  createdAt: string;
}

export interface PublicSnapshotResponse {
  event_id: string;
  day_key: string;
  official_approved: boolean;
  today_total: number;
  onsite_total: number;
  online_total: number;
  unselected_total: number;
  tomorrow_total: number;
  venues: Array<{
    id: VenueId;
    name: string;
    state: VenueState;
    description: string;
    updated_at: string;
    updated_by: string;
    details?: string;
  }>;
  my_attendance?: {
    today: boolean;
    tomorrow: boolean;
    selected_venue: VenueId | null;
  } | null;
}

export interface MomentSubmission {
  id: string;
  authUserId: string;
  fileName: string;
  mediaType: string;
  size: number;
  storagePath: string;
  status: "pending_review" | "approved" | "rejected";
  createdAt: string;
  reviewNote?: string | null;
}

export interface MomentUploadState {
  phase: "idle" | "uploading" | "pending_review" | "error";
  message?: string;
}

export interface RemoteDataGateway {
  ensureAnonymousAuth(): Promise<void>;
  fetchSnapshot(): Promise<PublicSnapshotResponse>;
  setAttendance(mutation: AttendanceMutation): Promise<PublicSnapshotResponse>;
  setVenueState(
    venueId: VenueId,
    state: VenueState,
    requestId: string,
  ): Promise<OperatorLog>;
  subscribeToVenues(onChange: () => void): () => void;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  getOperatorSession(): Promise<OperatorSession>;
  fetchOperatorLogs(): Promise<OperatorLog[]>;
  uploadMoment(file: File, draft: MomentDraft): Promise<void>;
  listPendingMoments(): Promise<MomentSubmission[]>;
  createMomentPreview(storagePath: string): Promise<string>;
  reviewMoment(
    momentId: string,
    status: "approved" | "rejected",
    note: string,
  ): Promise<void>;
}

export interface RemoteRepositoryState {
  snapshot: AppSnapshot;
  status: RepositoryStatus;
  operator: OperatorSession;
  moments: MomentSubmission[];
  momentUpload: MomentUploadState;
}

export function isNetworkFailure(error: unknown): boolean {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400) {
      return false;
    }
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    message,
  );
}

export function mapPublicSnapshot(
  remote: PublicSnapshotResponse,
  local: AppSnapshot,
): AppSnapshot {
  const venues: VenueStatus[] = remote.venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    state: venue.state,
    description: venue.description,
    updatedAt: venue.updated_at,
    updatedBy: venue.updated_by,
    details: venue.details,
  }));

  return {
    ...local,
    publicCounts: {
      todayTotal: remote.today_total,
      onsiteTotal: remote.onsite_total,
      onlineTotal: remote.online_total,
      unselectedTotal:
        remote.unselected_total ??
        Math.max(
          0,
          remote.today_total - remote.onsite_total - remote.online_total,
        ),
      tomorrowTotal: remote.tomorrow_total,
    },
    venues,
    attendance: remote.my_attendance
      ? {
          ...local.attendance,
          today: remote.my_attendance.today,
          tomorrow: remote.my_attendance.tomorrow,
          selectedVenue: remote.my_attendance.selected_venue,
        }
      : local.attendance,
  };
}
