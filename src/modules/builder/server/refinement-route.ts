import { z } from "zod";

import type { BuilderWorkspace } from "../core/contracts";
import { publicBuilderError } from "./errors";
import { runBuilderRefinement } from "./refinement";

type RefineRouteResult =
  | Readonly<{ ok: true; data: BuilderWorkspace }>
  | Readonly<{ ok: false; error: string }>;

export async function refineBuilderRequest(
  request: Request,
): Promise<Response> {
  try {
    const body = await request.json();
    if (
      !isRecord(body) ||
      !isRecord(body.environment) ||
      !isRecord(body.input)
    ) {
      return errorResponse("Invalid Builder refinement request.");
    }

    const workspace = await runBuilderRefinement(
      body.environment,
      body.input,
      request.signal,
    );
    return Response.json({
      ok: true,
      data: workspace,
    } satisfies RefineRouteResult);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid Builder refinement request.")
        : publicBuilderError(error, {
            fallback: "The Builder request failed.",
            context: "Builder refinement Route Handler failed.",
          });
    return errorResponse(message);
  }
}

function errorResponse(error: string): Response {
  return Response.json({ ok: false, error } satisfies RefineRouteResult, {
    status: 400,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
