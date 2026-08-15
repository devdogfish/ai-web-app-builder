import type { ComponentData } from "./contracts";

export function mergeComponentData(
  defaults: ComponentData,
  provided: ComponentData,
): ComponentData;
export function mergeComponentData(
  defaults: unknown,
  provided: unknown,
): unknown;
export function mergeComponentData(
  defaults: unknown,
  provided: unknown,
): unknown {
  if (
    defaults &&
    provided &&
    typeof defaults === "object" &&
    typeof provided === "object" &&
    !Array.isArray(defaults) &&
    !Array.isArray(provided)
  ) {
    const result = { ...(defaults as Record<string, unknown>) };
    for (const [key, value] of Object.entries(
      provided as Record<string, unknown>,
    )) {
      result[key] = mergeComponentData(result[key], value);
    }
    return result;
  }
  return provided;
}
