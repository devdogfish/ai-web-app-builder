import { describe, expect, it } from "vitest";

import {
  CohereAdapter,
  OpenRouterAdapter,
  type ArticleModel,
  type FetchLike,
} from "../ai";

const modelRequest = {
  currentArticleHtml: "<article>Before</article>",
  currentPrompt: "Update it",
} as const;

type AdapterFactory = (fetch: FetchLike) => ArticleModel;

const adapters: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["OpenRouter", (fetch) => new OpenRouterAdapter({ apiKey: "test", fetch })],
  ["Cohere", (fetch) => new CohereAdapter({ apiKey: "test", fetch })],
];

async function drain(model: ArticleModel, signal?: AbortSignal): Promise<void> {
  const iterator = model.stream(modelRequest, { signal })[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) {}
}

describe.each(adapters)("%s shared provider contract", (_name, createAdapter) => {
  it.each([
    [401, "authentication"],
    [429, "rate_limit"],
    [504, "timeout"],
    [503, "provider"],
  ] as const)("normalizes HTTP %s", async (status, code) => {
    const model = createAdapter(async () => new Response("failure", { status }));
    await expect(drain(model)).rejects.toMatchObject({ code, status });
  });

  it("supports cancellation", async () => {
    const controller = new AbortController();
    const model = createAdapter(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
          if (init?.signal?.aborted) rejectAbort();
          else init?.signal?.addEventListener("abort", rejectAbort, { once: true });
        }),
    );

    const pending = drain(model, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});
