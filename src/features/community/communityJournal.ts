import { useCallback, useState } from "react";

/**
 * "우리 나눔 기록"은 기기 전용이다.
 * 카풀·간식·사진·감사 기록은 서버 타입, RPC payload, SQL schema 어디에도 존재하지 않는다.
 * 순위, 비교, 연속 기록을 만들지 않는다.
 */
export type ShareKind = "carpool" | "snack" | "photo" | "thanks";

export interface ShareEntry {
  id: string;
  kind: ShareKind;
  dayIndex: number;
  note: string;
  createdAt: string;
}

export const SHARE_KIND_LABELS: Record<ShareKind, string> = {
  carpool: "카풀",
  snack: "간식",
  photo: "사진",
  thanks: "감사",
};

export const MAX_JOURNAL_ENTRIES = 60;
export const MAX_NOTE_LENGTH = 120;

const STORAGE_KEY = "teuksae-app-v1-community-journal";
const STORAGE_VERSION = 1;

interface PersistedJournal {
  version: number;
  entries: ShareEntry[];
}

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `share-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function isShareKind(value: unknown): value is ShareKind {
  return (
    value === "carpool" ||
    value === "snack" ||
    value === "photo" ||
    value === "thanks"
  );
}

function isShareEntry(value: unknown): value is ShareEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as ShareEntry;
  return (
    typeof candidate.id === "string" &&
    isShareKind(candidate.kind) &&
    typeof candidate.dayIndex === "number" &&
    typeof candidate.note === "string" &&
    typeof candidate.createdAt === "string"
  );
}

export function readJournal(storage: Storage): ShareEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as PersistedJournal;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries.filter((entry) => isShareEntry(entry));
  } catch {
    return [];
  }
}

export function writeJournal(storage: Storage, entries: ShareEntry[]): void {
  const payload: PersistedJournal = {
    version: STORAGE_VERSION,
    entries: entries.slice(0, MAX_JOURNAL_ENTRIES),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 저장 공간이 없어도 화면은 계속 동작한다.
  }
}

export function createShareEntry(
  kind: ShareKind,
  note: string,
  dayIndex: number,
  now: Date = new Date(),
): ShareEntry {
  return {
    id: generateId(),
    kind,
    dayIndex,
    note: note.trim().slice(0, MAX_NOTE_LENGTH),
    createdAt: now.toISOString(),
  };
}

export interface CommunityJournal {
  entries: ShareEntry[];
  add: (kind: ShareKind, note: string, dayIndex: number) => ShareEntry;
  remove: (id: string) => void;
}

export function useCommunityJournal(
  storage: Storage | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): CommunityJournal {
  const [entries, setEntries] = useState<ShareEntry[]>(() =>
    storage ? readJournal(storage) : [],
  );

  const add = useCallback(
    (kind: ShareKind, note: string, dayIndex: number): ShareEntry => {
      const entry = createShareEntry(kind, note, dayIndex);
      setEntries((current) => {
        const next = [entry, ...current].slice(0, MAX_JOURNAL_ENTRIES);
        if (storage) {
          writeJournal(storage, next);
        }
        return next;
      });
      return entry;
    },
    [storage],
  );

  const remove = useCallback(
    (id: string): void => {
      setEntries((current) => {
        const next = current.filter((entry) => entry.id !== id);
        if (storage) {
          writeJournal(storage, next);
        }
        return next;
      });
    },
    [storage],
  );

  return { entries, add, remove };
}

export const communityJournalStorageKey = STORAGE_KEY;
