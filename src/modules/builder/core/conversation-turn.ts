import type { MessageStatus } from "./contracts";

export function toggleVersionDiff(
  activeVersionId: string | null,
  requestedVersionId: string,
): string | null {
  return activeVersionId === requestedVersionId ? null : requestedVersionId;
}

export function formatTurnDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  if (seconds < 1) return "a moment";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
}

export function assistantTurnStatusLabel(
  status: MessageStatus,
  durationMs: number | null,
): string {
  const duration = durationMs === null ? null : formatTurnDuration(durationMs);

  if (status === "stopped") {
    return duration ? `Stopped after ${duration}` : "Stopped";
  }
  if (status === "failed") {
    return duration ? `Failed after ${duration}` : "Failed";
  }
  return duration ? `Worked for ${duration}` : "Completed";
}
