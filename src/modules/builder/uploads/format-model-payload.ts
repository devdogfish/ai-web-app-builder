import { formatHtmlSource } from "../content/format-html";

export function formatModelPayload(payload: string): Promise<string> {
  if (!payload.includes("<")) return Promise.resolve(payload);
  return formatHtmlSource(payload);
}
