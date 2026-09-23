import type { AttendanceMutation } from "./types";
export const ATTENDANCE_QUEUE_KEY = "teuksae-app-v1-attendance-queue";
export const MAX_QUEUED_MUTATIONS = 50;
export function readAttendanceQueue(storage: Storage): AttendanceMutation[] {
  try {
    const value = JSON.parse(
      storage.getItem(ATTENDANCE_QUEUE_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value
          .filter((item): item is AttendanceMutation =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as AttendanceMutation).id === "string",
            ),
          )
          .slice(-MAX_QUEUED_MUTATIONS)
      : [];
  } catch {
    return [];
  }
}
export function enqueueAttendance(
  storage: Storage,
  mutation: AttendanceMutation,
): AttendanceMutation[] {
  const next = [
    ...readAttendanceQueue(storage).filter((item) => item.id !== mutation.id),
    mutation,
  ].slice(-MAX_QUEUED_MUTATIONS);
  storage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify(next));
  return next;
}
export function removeAttendanceMutation(
  storage: Storage,
  id: string,
): AttendanceMutation[] {
  const next = readAttendanceQueue(storage).filter((item) => item.id !== id);
  storage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify(next));
  return next;
}
export function serializeAttendanceMutation(
  mutation: AttendanceMutation,
): string {
  return JSON.stringify({
    id: mutation.id,
    eventId: mutation.eventId,
    dayKey: mutation.dayKey,
    today: mutation.today,
    tomorrow: mutation.tomorrow,
    selectedVenue: mutation.selectedVenue,
    createdAt: mutation.createdAt,
  });
}
