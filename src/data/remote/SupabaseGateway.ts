import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  MomentDraft,
  OperatorLog,
  VenueId,
  VenueState,
} from "../../domain/types";
import type {
  AttendanceMutation,
  MomentSubmission,
  OperatorSession,
  PublicSnapshotResponse,
  RemoteDataGateway,
} from "./types";

function extension(name: string): string {
  const value = name
    .split(".")
    .pop()
    ?.replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return value || "bin";
}

function mapLog(row: Record<string, unknown>): OperatorLog {
  return {
    id: String(row.id),
    venueId: row.venue_id as VenueId,
    before: row.before_state as VenueState,
    after: row.after_state as VenueState,
    updatedAt: String(row.created_at),
    updatedBy: String(row.updated_by ?? "운영자"),
  };
}

export class SupabaseGateway implements RemoteDataGateway {
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string, client?: SupabaseClient) {
    this.client =
      client ??
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
  }

  async ensureAnonymousAuth(): Promise<void> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      throw error;
    }
    if (!data.session) {
      const result = await this.client.auth.signInAnonymously();
      if (result.error) {
        throw result.error;
      }
    }
  }

  async fetchSnapshot(): Promise<PublicSnapshotResponse> {
    const { data, error } = await this.client.rpc("get_public_snapshot");
    if (error) {
      throw error;
    }
    return data as PublicSnapshotResponse;
  }

  async setAttendance(
    mutation: AttendanceMutation,
  ): Promise<PublicSnapshotResponse> {
    const payload = {
      p_event_id: mutation.eventId,
      p_day_key: mutation.dayKey,
      p_today: mutation.today,
      p_tomorrow: mutation.tomorrow,
      p_selected_venue: mutation.selectedVenue,
      p_request_id: mutation.id,
    };
    const { data, error } = await this.client.rpc("set_my_attendance", payload);
    if (error) {
      throw error;
    }
    return data as PublicSnapshotResponse;
  }

  async setVenueState(
    venueId: VenueId,
    state: VenueState,
    requestId: string,
  ): Promise<OperatorLog> {
    const { data, error } = await this.client.rpc("set_venue_state", {
      p_venue_id: venueId,
      p_state: state,
      p_request_id: requestId,
    });
    if (error) {
      throw error;
    }
    return mapLog(data as Record<string, unknown>);
  }

  subscribeToVenues(onChange: () => void): () => void {
    const channel = this.client
      .channel("public-venues")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venues" },
        onChange,
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  async sendMagicLink(email: string): Promise<void> {
    const { data, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    if (data.session?.user.is_anonymous) {
      const { error: signOutError } = await this.client.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
    }
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      throw error;
    }
  }

  async getOperatorSession(): Promise<OperatorSession> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      throw error;
    }
    const user = data.session?.user;
    if (!user || user.is_anonymous) {
      return { access: "logged_out" };
    }
    const result = await this.client.rpc("is_operator");
    if (result.error) {
      throw result.error;
    }
    return {
      access: result.data ? "operator" : "denied",
      email: user.email,
    };
  }

  async fetchOperatorLogs(): Promise<OperatorLog[]> {
    const { data, error } = await this.client
      .from("venue_state_events")
      .select("id,venue_id,before_state,after_state,created_at,updated_by")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => mapLog(row));
  }

  async uploadMoment(file: File, draft: MomentDraft): Promise<void> {
    const { data: auth, error: authError } = await this.client.auth.getUser();
    if (authError || !auth.user) {
      throw authError ?? new Error("익명 세션을 확인할 수 없습니다.");
    }
    const path = `${auth.user.id}/${draft.id}.${extension(file.name)}`;
    const uploaded = await this.client.storage
      .from("moment-submissions")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) {
      throw uploaded.error;
    }
    const inserted = await this.client.from("moment_submissions").insert({
      id: draft.id,
      auth_user_id: auth.user.id,
      file_name: file.name,
      media_type: file.type,
      size_bytes: file.size,
      storage_path: path,
      status: "pending_review",
      consent_confirmed: true,
    });
    if (inserted.error) {
      await this.client.storage.from("moment-submissions").remove([path]);
      throw inserted.error;
    }
  }

  async listPendingMoments(): Promise<MomentSubmission[]> {
    const { data, error } = await this.client
      .from("moment_submissions")
      .select("*")
      .eq("status", "pending_review")
      .order("created_at", { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      authUserId: row.auth_user_id,
      fileName: row.file_name,
      mediaType: row.media_type,
      size: row.size_bytes,
      storagePath: row.storage_path,
      status: row.status,
      createdAt: row.created_at,
      reviewNote: row.review_note,
    }));
  }

  async createMomentPreview(storagePath: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from("moment-submissions")
      .createSignedUrl(storagePath, 60);
    if (error) {
      throw error;
    }
    return data.signedUrl;
  }

  async reviewMoment(
    momentId: string,
    status: "approved" | "rejected",
    note: string,
  ): Promise<void> {
    const { error } = await this.client.rpc("review_moment", {
      p_moment_id: momentId,
      p_status: status,
      p_note: note,
    });
    if (error) {
      throw error;
    }
  }
}
