import { ArticleModelError } from "./types";

export function errorForStatus(provider: string, status: number, detail?: string): ArticleModelError {
  const suffix = detail ? ` ${detail}` : "";
  if (status === 401 || status === 403 || status === 498) {
    return new ArticleModelError(
      "authentication",
      `${provider} authentication failed.${suffix}`,
      { provider, status },
    );
  }
  if (status === 429) {
    return new ArticleModelError("rate_limit", `${provider} rate limit exceeded.${suffix}`, {
      provider,
      status,
    });
  }
  if (status === 408 || status === 504) {
    return new ArticleModelError("timeout", `${provider} request timed out.${suffix}`, {
      provider,
      status,
    });
  }
  if (status === 499) {
    return new ArticleModelError("cancelled", `${provider} request was cancelled.${suffix}`, {
      provider,
      status,
    });
  }
  return new ArticleModelError("provider", `${provider} request failed (${status}).${suffix}`, {
    provider,
    status,
  });
}

export function errorForProviderPayload(
  provider: string,
  code: unknown,
  message: unknown,
): ArticleModelError {
  const detail = typeof message === "string" ? message : "Provider stream failed.";
  if (typeof code === "number") return errorForStatus(provider, code, detail);

  const normalizedCode = typeof code === "string" ? code.toLowerCase() : "";
  if (/auth|api[_-]?key|token/.test(normalizedCode)) {
    return new ArticleModelError("authentication", `${provider} authentication failed. ${detail}`, {
      provider,
    });
  }
  if (/rate|quota/.test(normalizedCode)) {
    return new ArticleModelError("rate_limit", `${provider} rate limit exceeded. ${detail}`, {
      provider,
    });
  }
  if (/timeout|timed[_-]?out/.test(normalizedCode)) {
    return new ArticleModelError("timeout", `${provider} request timed out. ${detail}`, {
      provider,
    });
  }
  return new ArticleModelError("provider", detail, { provider });
}

export async function responseError(response: Response, provider: string): Promise<ArticleModelError> {
  let detail = "";
  try {
    const body = (await response.text()).trim();
    detail = body.slice(0, 500);
  } catch {
    // Status and provider are sufficient when an error body cannot be read.
  }
  return errorForStatus(provider, response.status, detail);
}

export function createRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Readonly<{
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
}> {
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  if (callerSignal?.aborted) controller.abort(callerSignal.reason);

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

export function normalizeThrownError(
  error: unknown,
  provider: string,
  callerSignal: AbortSignal | undefined,
  didTimeout: boolean,
): ArticleModelError {
  if (error instanceof ArticleModelError) return error;
  if (didTimeout) {
    return new ArticleModelError("timeout", `${provider} request timed out.`, {
      provider,
      cause: error,
    });
  }
  if (callerSignal?.aborted) {
    return new ArticleModelError("cancelled", `${provider} request was cancelled.`, {
      provider,
      cause: error,
    });
  }
  return new ArticleModelError("provider", `${provider} request failed.`, {
    provider,
    cause: error,
  });
}

export type SseEvent = Readonly<{ event?: string; data: string }>;

/** Minimal standards-compatible SSE decoder, including chunk and CRLF boundaries. */
export async function* parseSse(
  body: ReadableStream<Uint8Array> | null,
  provider: string,
): AsyncGenerator<SseEvent> {
  if (!body) {
    throw new ArticleModelError("malformed_response", `${provider} returned no response body.`, {
      provider,
    });
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName: string | undefined;
  let dataLines: string[] = [];

  const consumeLine = (line: string): SseEvent | undefined => {
    if (line === "") {
      if (dataLines.length === 0) {
        eventName = undefined;
        return undefined;
      }
      const event = { event: eventName, data: dataLines.join("\n") };
      eventName = undefined;
      dataLines = [];
      return event;
    }
    if (line.startsWith(":")) return undefined;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
    return undefined;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const event = consumeLine(line);
        if (event) yield event;
      }
      if (done) {
        if (buffer) {
          const event = consumeLine(buffer);
          if (event) yield event;
        }
        const finalEvent = consumeLine("");
        if (finalEvent) yield finalEvent;
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseEventJson(data: string, provider: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch (cause) {
    throw new ArticleModelError(
      "malformed_response",
      `${provider} returned a malformed stream event.`,
      { provider, cause },
    );
  }
}
