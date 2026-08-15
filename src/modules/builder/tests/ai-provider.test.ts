import { describe, expect, it, vi } from "vitest";

import {
  ArticleModelError,
  CohereAdapter,
  OpenRouterAdapter,
  createArticleModelFromEnv,
  type ArticleModel,
  type ArticleModelEvent,
  type ArticleModelRequest,
} from "../ai";

const request: ArticleModelRequest = {
  currentArticleHtml: "<article><h1>Old</h1></article>",
  currentPrompt: "Change the headline",
  selectedUploadExtracts: [
    { id: "upload-1", name: "brief.txt", text: "Use New" },
  ],
  recentRelevantTurns: [{ role: "user", content: "Keep it concise" }],
};

function sseResponse(events: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
    { status, headers: { "Content-Type": "text/event-stream" } },
  );
}

async function collect(
  model: ArticleModel,
  signal?: AbortSignal,
): Promise<ArticleModelEvent[]> {
  const events: ArticleModelEvent[] = [];
  for await (const event of model.stream(request, { signal }))
    events.push(event);
  return events;
}

describe("OpenRouterAdapter", () => {
  it("translates the request and normalizes streamed Article HTML", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(body.messages.at(-1)?.content).toContain(
          request.currentArticleHtml,
        );
        expect(body.messages.at(-1)?.content).toContain(request.currentPrompt);
        expect(body.messages.at(-1)?.content).toContain("brief.txt");
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"BUILDER_RESPONSE_V1\\n{\\\"action\\\":\\\"edit\\\",\\\"summary\\\":\\\"Update article headline\\\",\\\"response\\\":\\\"I updated the headline.\\\"}\\nBUILDER_ARTICLE_HTML_V1\\n<article>"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"<h1>New</h1></article>"}}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      },
    );
    const model = new OpenRouterAdapter({ apiKey: "key", fetch });

    await expect(collect(model)).resolves.toEqual([
      {
        type: "text-delta",
        text: 'BUILDER_RESPONSE_V1\n{"action":"edit","summary":"Update article headline","response":"I updated the headline."}\nBUILDER_ARTICLE_HTML_V1\n<article>',
      },
      { type: "text-delta", text: "<h1>New</h1></article>" },
      {
        type: "finish",
        result: {
          action: "edit",
          summary: "Update article headline",
          response: "I updated the headline.",
          articleHtml: "<article><h1>New</h1></article>",
        },
      },
    ]);
  });

  it.each([
    [401, "authentication"],
    [429, "rate_limit"],
    [504, "timeout"],
    [500, "provider"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const model = new OpenRouterAdapter({
      apiKey: "key",
      fetch: async () => new Response("upstream detail", { status }),
    });

    await expect(collect(model)).rejects.toMatchObject({ code, status });
  });

  it("rejects malformed events and incomplete streams", async () => {
    const malformed = new OpenRouterAdapter({
      apiKey: "key",
      fetch: async () => sseResponse(["data: not-json\n\n"]),
    });
    const incomplete = new OpenRouterAdapter({
      apiKey: "key",
      fetch: async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"<p>x</p>"}}]}\n\n',
        ]),
    });

    await expect(collect(malformed)).rejects.toMatchObject({
      code: "malformed_response",
    });
    await expect(collect(incomplete)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });

  it("normalizes in-stream provider failures", async () => {
    const model = new OpenRouterAdapter({
      apiKey: "key",
      fetch: async () =>
        sseResponse([
          'data: {"error":{"code":429,"message":"busy"},"choices":[]}\n\n',
        ]),
    });

    await expect(collect(model)).rejects.toMatchObject({
      code: "rate_limit",
      status: 429,
    });
  });

  it("rejects output-limit truncation even when partial output looks like HTML", async () => {
    const model = new OpenRouterAdapter({
      apiKey: "key",
      fetch: async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"<p>partial</p>"}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
          "data: [DONE]\n\n",
        ]),
    });

    await expect(collect(model)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });

  it("propagates caller cancellation as a stable error", async () => {
    const controller = new AbortController();
    const model = new OpenRouterAdapter({
      apiKey: "key",
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    });

    const pending = collect(model, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });

  it("maps adapter timeouts independently from cancellation", async () => {
    const model = new OpenRouterAdapter({
      apiKey: "key",
      timeoutMs: 1,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    });

    await expect(collect(model)).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("CohereAdapter", () => {
  it("translates and normalizes Cohere v2 stream events", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: unknown[];
          model: string;
        };
        expect(body.messages).toHaveLength(3);
        expect(body.model).toBe("command-test");
        return sseResponse([
          'event: content-delta\ndata: {"type":"content-delta","delta":{"message":{"content":{"text":"BUILDER_RESPONSE_V1\\n{\\\"action\\\":\\\"edit\\\",\\\"summary\\\":\\\"Revise article content\\\",\\\"response\\\":\\\"I revised the article.\\\"}\\nBUILDER_ARTICLE_HTML_V1\\n<main>"}}}}\n\n',
          'event: content-delta\ndata: {"type":"content-delta","delta":{"message":{"content":{"text":"Done</main>"}}}}\n\n',
          'event: message-end\ndata: {"type":"message-end"}\n\n',
        ]);
      },
    );
    const model = new CohereAdapter({
      apiKey: "key",
      model: "command-test",
      fetch,
    });

    await expect(collect(model)).resolves.toEqual([
      {
        type: "text-delta",
        text: 'BUILDER_RESPONSE_V1\n{"action":"edit","summary":"Revise article content","response":"I revised the article."}\nBUILDER_ARTICLE_HTML_V1\n<main>',
      },
      { type: "text-delta", text: "Done</main>" },
      {
        type: "finish",
        result: {
          action: "edit",
          summary: "Revise article content",
          response: "I revised the article.",
          articleHtml: "<main>Done</main>",
        },
      },
    ]);
  });

  it("ignores Cohere thinking deltas and emits only Article HTML text", async () => {
    const model = new CohereAdapter({
      apiKey: "key",
      fetch: async () =>
        sseResponse([
          'data: {"type":"content-start","index":0,"delta":{"message":{"content":{"type":"thinking","thinking":""}}}}\n\n',
          'data: {"type":"content-delta","index":0,"delta":{"message":{"content":{"thinking":"Reasoning"}}}}\n\n',
          'data: {"type":"content-end","index":0}\n\n',
          'data: {"type":"content-start","index":1,"delta":{"message":{"content":{"type":"text","text":""}}}}\n\n',
          'data: {"type":"content-delta","index":1,"delta":{"message":{"content":{"text":"BUILDER_RESPONSE_V1\\n{\\\"action\\\":\\\"answer\\\",\\\"response\\\":\\\"The article is concise.\\\"}"}}}}\n\n',
          'data: {"type":"content-end","index":1}\n\n',
          'data: {"type":"message-end","delta":{"finish_reason":"COMPLETE"}}\n\n',
        ]),
    });

    await expect(collect(model)).resolves.toEqual([
      {
        type: "text-delta",
        text: 'BUILDER_RESPONSE_V1\n{"action":"answer","response":"The article is concise."}',
      },
      {
        type: "finish",
        result: {
          action: "answer",
          response: "The article is concise.",
        },
      },
    ]);
  });

  it("rejects non-HTML final output", async () => {
    const model = new CohereAdapter({
      apiKey: "key",
      fetch: async () =>
        sseResponse([
          'data: {"type":"content-delta","delta":{"message":{"content":{"text":"BUILDER_RESPONSE_V1\\n{\\\"action\\\":\\\"edit\\\",\\\"response\\\":\\\"I made a change.\\\"}\\nBUILDER_ARTICLE_HTML_V1\\nnot html"}}}}\n\n',
          'data: {"type":"message-end"}\n\n',
        ]),
    });

    await expect(collect(model)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });

  it("rejects output-limit truncation", async () => {
    const model = new CohereAdapter({
      apiKey: "key",
      fetch: async () =>
        sseResponse([
          'data: {"type":"content-delta","delta":{"message":{"content":{"text":"<p>partial</p>"}}}}\n\n',
          'data: {"type":"message-end","delta":{"finish_reason":"MAX_TOKENS"}}\n\n',
        ]),
    });

    await expect(collect(model)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
});

describe("createArticleModelFromEnv", () => {
  it("requires explicit selection and never falls back", () => {
    expect(() => createArticleModelFromEnv({})).toThrowError(ArticleModelError);
    expect(() =>
      createArticleModelFromEnv({
        AI_PROVIDER: "cohere",
        OPENROUTER_API_KEY: "wrong-key",
      }),
    ).toThrowError(/COHERE_API_KEY/);
  });

  it("selects only the configured adapter", () => {
    expect(
      createArticleModelFromEnv({
        AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "key",
      }),
    ).toBeInstanceOf(OpenRouterAdapter);
    expect(
      createArticleModelFromEnv({
        AI_PROVIDER: "cohere",
        COHERE_API_KEY: "key",
      }),
    ).toBeInstanceOf(CohereAdapter);
  });
});
