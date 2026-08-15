import "server-only";

import type { EnvironmentReference, WebsiteConfig } from "./types";
import { getWebsiteConfig } from "./websites";

export function resolveEnvironmentReference(
  reference: EnvironmentReference,
): WebsiteConfig {
  return getWebsiteConfig(reference.website);
}
