import "server-only";

import type { BuilderEnvironment, EnvironmentReference } from "./types";
import { resolveRequestEnvironment } from "@/modules/builder/core/server";

export type BuilderOperation =
  "read" | "bootstrap" | "mutate" | "refine" | "upload";

/**
 * Authentication/authorization seam. Replace this function in the host app
 * with an authenticated article lookup returning authoritative metadata.
 * Production fails closed until that integration exists.
 */
export async function resolveAuthorizedEnvironment(
  reference: EnvironmentReference,
  operation: BuilderOperation,
): Promise<BuilderEnvironment> {
  await assertBuilderActionAccess(operation);
  return resolveRequestEnvironment(reference);
}

/**
 * Authentication/authorization seam for Server Actions. Host integrations
 * should derive the actor from their server session, headers, or cookies.
 */
export async function assertBuilderActionAccess(
  operation: BuilderOperation,
): Promise<void> {
  void operation;
  const developmentBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.BUILDER_ALLOW_UNAUTHENTICATED_DEVELOPMENT !== "false";
  if (!developmentBypass) {
    throw new Error(
      "Builder authorization is not configured. Replace resolveAuthorizedEnvironment with the host application's authenticated article lookup.",
    );
  }
}
