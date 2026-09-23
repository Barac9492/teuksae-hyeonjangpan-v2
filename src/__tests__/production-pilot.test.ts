import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sql from "../../supabase/migrations/001_production_pilot.sql?raw";
import { defaultAppConfig } from "../domain/config";
import type {
  MomentDraft,
  OperatorLog,
  VenueId,
  VenueState,
} from "../domain/types";
import { LocalAppRepository } from "../data/LocalAppRepository";
import { createSeedSnapshot } from "../data/seed";
import { resolveRuntimeBackend } from "../data/runtime";
import {
  enqueueAttendance,
  readAttendanceQueue,
  serializeAttendanceMutation,
} from "../data/remote/attendanceQueue";
import { SupabaseAppRepository } from "../data/remote/SupabaseAppRepository";
import { SupabaseGateway } from "../data/remote/SupabaseGateway";
import type {
  AttendanceMutation,
  OperatorSession,
  PublicSnapshotResponse,
  RemoteDataGateway,
} from "../data/remote/types";
import { isNetworkFailure, mapPublicSnapshot } from "../data/remote/types";

function remoteSnapshot(
  attendance: PublicSnapshotResponse["my_attendance"] = null,
): PublicSnapshotResponse {
  return {
    event_id: "00000000-0000-0000-0000-000000000001",
    day_key: "pilot-day",
    official_approved: false,
    today_total: 3,
    onsite_total: 1,
    online_total: 1,
    unselected_total: 1,
    tomorrow_total: 3,
    my_attendance: attendance,
    venues: [
      {
        id: "online",
        name: "온라인 예배",
        state: "open",
        description: "같은 예배",
        updated_at: "2026-08-24T00:00:00Z",
        updated_by: "운영자",
      },
    ],
  };
}

class FakeGateway implements RemoteDataGateway {
  attendanceCalls: AttendanceMutation[] = [];
  uploads: Array<{ file: File; draft: MomentDraft }> = [];
  ensureAuthCalls = 0;
  realtimeSubscriptions = 0;
  attendanceError: unknown = null;

  constructor(public operator: OperatorSession = { access: "logged_out" }) {}

  async ensureAnonymousAuth(): Promise<void> {
    this.ensureAuthCalls += 1;
  }

  async fetchSnapshot(): Promise<PublicSnapshotResponse> {
    return remoteSnapshot();
  }

  async setAttendance(
    mutation: AttendanceMutation,
  ): Promise<PublicSnapshotResponse> {
    this.attendanceCalls.push(mutation);
    if (this.attendanceError) {
      throw this.attendanceError;
    }
    return remoteSnapshot({
      today: mutation.today,
      tomorrow: mutation.tomorrow,
      selected_venue: mutation.selectedVenue,
    });
  }

  async setVenueState(
    venueId: VenueId,
    state: VenueState,
    requestId: string,
  ): Promise<OperatorLog> {
    return {
      id: requestId,
      venueId,
      before: "open",
      after: state,
      updatedAt: new Date().toISOString(),
      updatedBy: "운영자",
    };
  }

  subscribeToVenues(): () => void {
    this.realtimeSubscriptions += 1;
    return () => undefined;
  }

  async sendMagicLink(): Promise<void> {}
  async signOut(): Promise<void> {}
  async getOperatorSession(): Promise<OperatorSession> {
    return this.operator;
  }
  async fetchOperatorLogs(): Promise<OperatorLog[]> {
    return [];
  }
  async uploadMoment(file: File, draft: MomentDraft): Promise<void> {
    this.uploads.push({ file, draft });
  }
  async listPendingMoments(): Promise<[]> {
    return [];
  }
  async createMomentPreview(): Promise<string> {
    return "https://example.test/signed";
  }
  async reviewMoment(): Promise<void> {}
}

describe("production runtime safety", () => {
  it("fails closed when production public env is missing", () => {
    const result = resolveRuntimeBackend({ VITE_APP_MODE: "production" });
    expect(result.remoteEnabled).toBe(false);
    expect(result.error).toContain("안전하게 중지");
  });

  it("keeps pilot without env clearly in local rehearsal", () => {
    const result = resolveRuntimeBackend({ VITE_APP_MODE: "pilot" });
    expect(result.rehearsal).toBe(true);
    expect(result.error).toContain("로컬 운영 리허설");
  });
});

describe("magic-link session transition", () => {
  it("signs out an existing anonymous session before requesting OTP", async () => {
    const calls: string[] = [];
    const client = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { is_anonymous: true } } },
          error: null,
        }),
        signOut: async () => {
          calls.push("signOut");
          return { error: null };
        },
        signInWithOtp: async () => {
          calls.push("signInWithOtp");
          return { error: null };
        },
      },
    } as unknown as SupabaseClient;
    const gateway = new SupabaseGateway(
      "https://example.supabase.co",
      "anon",
      client,
    );

    await gateway.sendMagicLink("operator@example.org");
    expect(calls).toEqual(["signOut", "signInWithOtp"]);
  });
});

describe("remote mapping and privacy", () => {
  it("maps server categories while retaining local-only practice", () => {
    const local = createSeedSnapshot(defaultAppConfig);
    local.practice.wordNote = "서버 금지 메모";
    const mapped = mapPublicSnapshot(remoteSnapshot(), local);

    expect(mapped.publicCounts.todayTotal).toBe(3);
    expect(mapped.publicCounts.onsiteTotal).toBe(1);
    expect(mapped.publicCounts.onlineTotal).toBe(1);
    expect(mapped.publicCounts.unselectedTotal).toBe(1);
    expect(mapped.practice.wordNote).toBe("서버 금지 메모");
  });

  it("never serializes notes or practice in attendance payloads", () => {
    const serialized = serializeAttendanceMutation({
      id: "a",
      eventId: "e",
      dayKey: "d",
      today: true,
      tomorrow: false,
      selectedVenue: "online",
      createdAt: "now",
    });
    expect(serialized).not.toMatch(
      /wordNote|prayerNote|practice|selectedAction|completedDayIndexes|carpool|snack|journal|서버 금지/,
    );
  });
});

describe("lazy anonymous auth and attendance queue", () => {
  beforeEach(() => localStorage.clear());

  it("does not create anonymous auth during public bootstrap", async () => {
    const gateway = new FakeGateway();
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(repository.getStatus().phase).toBe("connected"),
    );
    expect(gateway.ensureAuthCalls).toBe(0);
    repository.destroy();
  });

  it("creates auth lazily before the first attendance mutation", async () => {
    const gateway = new FakeGateway();
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(repository.getStatus().phase).toBe("connected"),
    );
    await repository.setAttendanceToday(true);
    expect(gateway.ensureAuthCalls).toBe(1);
    repository.destroy();
  });

  it("queues genuine network failures and keeps the optimistic state", async () => {
    const gateway = new FakeGateway();
    gateway.attendanceError = new TypeError("Failed to fetch");
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(repository.getStatus().phase).toBe("connected"),
    );
    await repository.setAttendanceToday(true);

    expect(repository.getSnapshot().attendance.today).toBe(true);
    expect(readAttendanceQueue(localStorage)).toHaveLength(1);
    expect(repository.getStatus().phase).toBe("offline");
    repository.destroy();
  });

  it("rolls back and does not queue RLS or validation errors", async () => {
    const gateway = new FakeGateway();
    gateway.attendanceError = {
      status: 403,
      code: "42501",
      message: "row-level security violation",
    };
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(repository.getStatus().phase).toBe("connected"),
    );

    await expect(repository.setAttendanceToday(true)).rejects.toMatchObject({
      status: 403,
    });
    expect(repository.getSnapshot().attendance.today).toBe(false);
    expect(readAttendanceQueue(localStorage)).toHaveLength(0);
    expect(repository.getStatus().phase).toBe("error");
    repository.destroy();
  });

  it("drops stale event/day mutations without creating auth", async () => {
    enqueueAttendance(localStorage, {
      id: "stale",
      eventId: "old-event",
      dayKey: "old-day",
      today: true,
      tomorrow: false,
      selectedVenue: null,
      createdAt: "now",
    });
    const gateway = new FakeGateway();
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(readAttendanceQueue(localStorage)).toHaveLength(0),
    );
    expect(gateway.attendanceCalls).toHaveLength(0);
    expect(gateway.ensureAuthCalls).toBe(0);
    repository.destroy();
  });

  it("replays current queued mutations after ensuring auth", async () => {
    enqueueAttendance(localStorage, {
      id: "queued",
      eventId: remoteSnapshot().event_id,
      dayKey: remoteSnapshot().day_key,
      today: true,
      tomorrow: false,
      selectedVenue: "online",
      createdAt: "now",
    });
    const gateway = new FakeGateway();
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(gateway.attendanceCalls.some((item) => item.id === "queued")).toBe(
        true,
      ),
    );
    expect(gateway.ensureAuthCalls).toBe(1);
    expect(readAttendanceQueue(localStorage)).toHaveLength(0);
    repository.destroy();
  });

  it("replays a valid queued mutation before a newly initiated mutation", async () => {
    const gateway = new FakeGateway();
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(repository.getStatus().phase).toBe("connected"),
    );

    enqueueAttendance(localStorage, {
      id: "older-queued-request",
      eventId: remoteSnapshot().event_id,
      dayKey: remoteSnapshot().day_key,
      today: false,
      tomorrow: true,
      selectedVenue: "online",
      createdAt: "earlier",
    });
    await repository.setAttendanceToday(true);

    expect(gateway.attendanceCalls).toHaveLength(2);
    expect(gateway.attendanceCalls[0].id).toBe("older-queued-request");
    expect(gateway.attendanceCalls[1].id).not.toBe("older-queued-request");
    expect(gateway.attendanceCalls[1].today).toBe(true);
    repository.destroy();
  });

  it("deduplicates request ids and caps the queue at 50", () => {
    for (let index = 0; index < 55; index += 1) {
      enqueueAttendance(localStorage, {
        id: String(index),
        eventId: "e",
        dayKey: "d",
        today: true,
        tomorrow: false,
        selectedVenue: null,
        createdAt: "now",
      });
    }
    enqueueAttendance(localStorage, {
      id: "54",
      eventId: "e",
      dayKey: "d",
      today: false,
      tomorrow: false,
      selectedVenue: null,
      createdAt: "later",
    });
    const queue = readAttendanceQueue(localStorage);
    expect(queue).toHaveLength(50);
    expect(queue.filter((item) => item.id === "54")).toHaveLength(1);
    expect(queue.at(-1)?.today).toBe(false);
  });

  it("classifies HTTP errors separately from network failures", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure({ status: 422, message: "invalid input" })).toBe(
      false,
    );
  });
});

describe("operator guard and moment bytes", () => {
  beforeEach(() => localStorage.clear());

  it.each<OperatorSession>([{ access: "logged_out" }, { access: "denied" }])(
    "rejects venue writes for $access",
    async (operator) => {
      const repository = new SupabaseAppRepository(
        defaultAppConfig,
        new FakeGateway(operator),
        localStorage,
      );
      await vi.waitFor(() =>
        expect(repository.getOperatorSession().access).toBe(operator.access),
      );
      await expect(
        repository.setVenueState("online", "busy", "ignored"),
      ).rejects.toThrow("권한");
      repository.destroy();
    },
  );

  it("allows an operator and authenticates before passing file bytes", async () => {
    const gateway = new FakeGateway({ access: "operator" });
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    await vi.waitFor(() =>
      expect(repository.getOperatorSession().access).toBe("operator"),
    );
    await repository.setVenueState("online", "busy", "ignored");

    const file = new File(["bytes"], "a.jpg", { type: "image/jpeg" });
    const draft: MomentDraft = {
      id: "m",
      fileName: "a.jpg",
      mediaType: "image/jpeg",
      size: file.size,
      status: "pending_review",
      createdAt: "now",
    };
    await repository.uploadMoment(file, draft);
    expect(gateway.ensureAuthCalls).toBe(1);
    expect(gateway.uploads[0].file).toBe(file);
    expect(gateway.uploads[0].draft.status).toBe("pending_review");
    repository.destroy();
  });
});

describe("repository cleanup", () => {
  beforeEach(() => localStorage.clear());

  it("removes the local storage listener when destroyed", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const repository = new LocalAppRepository(defaultAppConfig, localStorage);
    repository.destroy();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
    remove.mockRestore();
  });

  it("does not subscribe after destroy while bootstrap is pending", async () => {
    const gateway = new FakeGateway();
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      gateway,
      localStorage,
    );
    repository.destroy();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(gateway.realtimeSubscriptions).toBe(0);
  });

  it("destroys the composed local repository from remote destroy", () => {
    const destroyLocal = vi.spyOn(LocalAppRepository.prototype, "destroy");
    const repository = new SupabaseAppRepository(
      defaultAppConfig,
      new FakeGateway(),
      localStorage,
    );
    repository.destroy();
    expect(destroyLocal).toHaveBeenCalledTimes(1);
    destroyLocal.mockRestore();
  });
});

describe("SQL security contract", () => {
  it("enables RLS and fixes every definer search path to empty", () => {
    for (const table of [
      "app_events",
      "venues",
      "attendance_checkins",
      "attendance_mutation_receipts",
      "operator_members",
      "venue_state_events",
      "moment_submissions",
    ]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    const definers = sql.match(/security definer/g) ?? [];
    const emptyPaths = sql.match(/set search_path = ''/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(emptyPaths).toHaveLength(definers.length);
    expect(sql).not.toContain("set search_path = public");
  });

  it("uses immutable receipts so an old duplicate cannot overwrite newer state", () => {
    expect(sql).toContain("create table public.attendance_mutation_receipts");
    expect(sql).toContain(
      "primary key (request_id, auth_user_id, event_id, day_key)",
    );
    expect(sql).toContain(
      "alter table public.attendance_mutation_receipts enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table public.attendance_mutation_receipts from anon, authenticated",
    );
    expect(sql).not.toMatch(
      /grant .*attendance_mutation_receipts.*to (anon|authenticated)/,
    );
    expect(sql).toContain(
      "on conflict (request_id, auth_user_id, event_id, day_key) do nothing",
    );
    expect(sql).toContain("if v_receipt_rows = 0 then");
    expect(sql).not.toContain("last_request_id");

    const receiptInsert = sql.indexOf(
      "insert into public.attendance_mutation_receipts",
    );
    const checkinInsert = sql.indexOf(
      "insert into public.attendance_checkins",
      receiptInsert,
    );
    expect(receiptInsert).toBeGreaterThan(0);
    expect(checkinInsert).toBeGreaterThan(receiptInsert);
  });

  it("publishes venues to Realtime with an idempotent catalog guard", () => {
    expect(sql).toContain("from pg_catalog.pg_publication as publication");
    expect(sql).toContain("from pg_catalog.pg_publication_tables as published");
    expect(sql).toContain("published.tablename = 'venues'");
    expect(sql).toContain(
      "alter publication supabase_realtime add table public.venues",
    );
  });

  it("allows public snapshot reads without creating an auth user", () => {
    expect(sql).toContain(
      "grant execute on function public.get_public_snapshot() to anon, authenticated",
    );
    expect(sql).toContain("when auth.uid() is null then null");
  });

  it("rejects anonymous JWT operators and records immutable actor ids", () => {
    expect(sql).toContain("auth.jwt() ->> 'is_anonymous'");
    expect(sql).toContain("actor_user_id uuid not null references auth.users");
    expect(sql).toContain("venue_state_events_immutable");
  });

  it("uses owned storage paths for upload and delete", () => {
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).not.toContain("owner_id = auth.uid()");
    expect(sql).toContain(
      "'moment-submissions',\n  'moment-submissions',\n  false",
    );
  });

  it("has explicit table/function revokes and no anon operator writes", () => {
    expect(sql).toContain(
      "revoke all on table public.operator_members from anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.set_venue_state(\n  public.venue_id, public.venue_state, uuid\n) from public, anon, authenticated",
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.set_venue_state[\s\S]*?to anon/,
    );
  });

  it("separates onsite, online, and location-unselected counts", () => {
    expect(sql).toContain("attendance.selected_venue is not null");
    expect(sql).toContain("as unselected_total");
  });

  it("never defines personal notes in remote SQL", () => {
    expect(sql).not.toMatch(
      /wordNote|word_note|prayerNote|prayer_note|selectedAction|completedDayIndexes|carpool|snack|share_entries|community_journal/,
    );
  });
});
