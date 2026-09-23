import { beforeEach, describe, expect, it } from "vitest";
import { defaultAppConfig } from "../domain/config";
import type { MomentDraft } from "../domain/types";
import {
  LocalAppRepository,
  localStorageKey,
} from "../data/LocalAppRepository";

describe("LocalAppRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to seeded defaults on corrupted storage", () => {
    window.localStorage.setItem(localStorageKey, "{broken-json");
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const snapshot = repository.getSnapshot();

    expect(snapshot.publicCounts.todayTotal).toBe(2659);
    expect(snapshot.attendance.today).toBe(false);
  });

  it("falls back to seeded defaults on old storage version", () => {
    window.localStorage.setItem(
      localStorageKey,
      JSON.stringify({ version: 0, snapshot: { invalid: true } }),
    );
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const snapshot = repository.getSnapshot();

    expect(snapshot.weekDays).toHaveLength(6);
    expect(snapshot.attendance.selectedVenue).toBeNull();
  });

  it("persists attendance and tomorrow flags with counts", () => {
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    repository.setAttendanceToday(true);
    repository.setTomorrowAttendance(true);

    const reloaded = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const snapshot = reloaded.getSnapshot();

    expect(snapshot.attendance.today).toBe(true);
    expect(snapshot.attendance.tomorrow).toBe(true);
    expect(snapshot.publicCounts.todayTotal).toBe(2660);
    expect(snapshot.publicCounts.onsiteTotal).toBe(2041);
    expect(snapshot.publicCounts.unselectedTotal).toBe(1);
    expect(snapshot.publicCounts.tomorrowTotal).toBe(1385);
  });

  it("persists venue selection and shifts online/onsite count when attending", () => {
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    repository.setAttendanceToday(true);
    repository.selectVenue("online");

    const snapshot = repository.getSnapshot();
    expect(snapshot.attendance.selectedVenue).toBe("online");
    expect(snapshot.publicCounts.onlineTotal).toBe(619);
    expect(snapshot.publicCounts.onsiteTotal).toBe(2041);
    expect(snapshot.publicCounts.unselectedTotal).toBe(0);
  });

  it("creates immutable operator logs on status update", () => {
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const before = repository.getSnapshot().operatorLogs.length;

    const log = repository.setVenueState("dream", "busy", "운영자 테스트");
    const snapshot = repository.getSnapshot();

    expect(log.before).toBe("recommended");
    expect(log.after).toBe("busy");
    expect(snapshot.operatorLogs.length).toBe(before + 1);
    expect(snapshot.operatorLogs[0].id).toBe(log.id);
    expect(snapshot.venues.find((venue) => venue.id === "dream")?.state).toBe(
      "busy",
    );
  });

  it("persists personal notes and practice selection/completion", () => {
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    repository.setPracticeAction("점심 전에 묵상");
    repository.togglePracticeCompleted(defaultAppConfig.todayIndex);
    repository.setWordNote("오늘 본 말씀");
    repository.setPrayerNote("짧은 기도");

    const reloaded = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const snapshot = reloaded.getSnapshot();

    expect(snapshot.practice.selectedAction).toBe("점심 전에 묵상");
    expect(snapshot.practice.completedDayIndexes).toContain(
      defaultAppConfig.todayIndex,
    );
    expect(snapshot.practice.wordNote).toBe("오늘 본 말씀");
    expect(snapshot.practice.prayerNote).toBe("짧은 기도");
  });

  it("persists moment metadata with id field without blob or object URL", () => {
    const repository = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const draft: MomentDraft = {
      id: "moment-test-id-001",
      fileName: "retreat.jpg",
      mediaType: "image/jpeg",
      size: 2048,
      status: "pending_review",
      createdAt: "2026-08-24T02:30:00.000Z",
    };

    repository.addMomentDraft(draft);

    const reloaded = new LocalAppRepository(
      defaultAppConfig,
      window.localStorage,
    );
    const stored = reloaded.getSnapshot().moments[0];

    expect(stored.id).toBe("moment-test-id-001");
    expect(stored.fileName).toBe("retreat.jpg");
    expect(stored.mediaType).toBe("image/jpeg");
    expect(stored.status).toBe("pending_review");
    expect(JSON.stringify(stored)).not.toContain("blob:");
    expect(JSON.stringify(stored)).not.toContain("objectURL");
    expect(JSON.stringify(stored)).not.toContain("localId");
  });
});
