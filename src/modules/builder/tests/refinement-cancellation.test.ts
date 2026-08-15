import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createArticleModelFromEnv } from "../ai/server";
import { ArticleModelError } from "../ai/types";
import { createArticleRepository, type ArticleWorkspace } from "../db";
import type { BuilderEnvironment } from "../environment/types";

vi.mock("server-only", () => ({}));
vi.mock("../db/server", () => ({ getArticleRepository: vi.fn() }));
vi.mock("../environment/request-resolver", () => ({
  resolveAuthorizedEnvironment: vi.fn(async (reference) => reference),
}));
vi.mock("../environment/host-sync", () => ({
  flushHostSync: vi.fn(async () => true),
}));
vi.mock("../ai/server", () => ({ createArticleModelFromEnv: vi.fn() }));
vi.mock("../core/server", () => ({
  assertWorkspaceEnvironment: vi.fn(),
  toBuilderWorkspace: (
    environment: BuilderEnvironment,
    workspace: ArticleWorkspace | null,
  ) => ({
    environment,
    needsBootstrap: !workspace,
    chatId: workspace?.chat.id ?? null,
    articleHtml: workspace?.article.html ?? "",
    currentVersionId: workspace?.chat.currentVersionId ?? null,
    messages:
      workspace?.messages.map((message) => ({
        id: message.id,
        role: message.role,
        kind: message.kind,
        content: message.content,
        status: message.status,
        versionId: null,
        uploadIds: [],
        errorCode: message.errorCode,
        createdAt: message.createdAt.toISOString(),
      })) ?? [],
    versions:
      workspace?.versions.map((version) => ({
        id: version.id,
        number: version.number,
        parentVersionId: version.parentVersionId,
        content: version.html,
        summary: version.summary,
        source: version.source,
        sha256: version.sha256,
        createdAt: version.createdAt.toISOString(),
      })) ?? [],
    uploads: [],
    articleImages: [],
    compactMemoryTokenEstimate: 0,
    compactedThroughMessageId: null,
    hostSyncPending: false,
  }),
}));

const environment = {
  articleId: "article-1",
  articleTitle: "Article title",
  articleSlug: "article-title",
  website: "rbccm",
} as const;

let getArticleRepository: typeof import("../db/server").getArticleRepository;
let runBuilderRefinement: typeof import("../server/refinement").runBuilderRefinement;

beforeAll(async () => {
  ({ getArticleRepository } = await import("../db/server"));
  ({ runBuilderRefinement } = await import("../server/refinement"));
});

describe("Builder refinement cancellation", () => {
  let repository: ReturnType<typeof createArticleRepository>;

  beforeEach(() => {
    repository = createArticleRepository({ filename: ":memory:" });
    repository.bootstrapArticle({
      article: {
        id: environment.articleId,
        website: "website-1",
        articleType: "article-type-1",
        title: environment.articleTitle,
      },
      html: "<article><p>Before</p></article>",
    });
    vi.mocked(getArticleRepository).mockReturnValue(repository);
  });

  afterEach(() => repository.close());

  it("keeps the user turn and records a stopped assistant turn", async () => {
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    vi.mocked(createArticleModelFromEnv).mockReturnValue({
      provider: "openrouter",
      model: "test",
      async *stream(_request, options) {
        markStarted();
        await new Promise<never>((_resolve, reject) => {
          const stop = () =>
            reject(new ArticleModelError("cancelled", "cancelled"));
          if (options?.signal?.aborted) stop();
          else options?.signal?.addEventListener("abort", stop, { once: true });
        });
      },
    });

    const pending = runBuilderRefinement(
      environment,
      { prompt: "Rewrite this", uploadIds: [] },
      controller.signal,
    );
    await started;
    controller.abort();

    const workspace = await pending;
    expect(workspace.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Rewrite this",
        status: "complete",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "Generation stopped.",
        status: "stopped",
        errorCode: "cancelled",
      }),
    ]);
    expect(workspace.versions).toHaveLength(1);
    expect(workspace.articleHtml).toBe("<article><p>Before</p></article>");
  });

  it("does not commit output when cancellation wins before persistence", async () => {
    const controller = new AbortController();
    vi.mocked(createArticleModelFromEnv).mockReturnValue({
      provider: "openrouter",
      model: "test",
      async *stream() {
        controller.abort();
        yield {
          type: "finish",
          result: {
            action: "edit",
            response: "Updated",
            summary: "Update article",
            articleHtml: "<article><p>After</p></article>",
          },
        } as const;
      },
    });

    const workspace = await runBuilderRefinement(
      environment,
      { prompt: "Rewrite this", uploadIds: [] },
      controller.signal,
    );

    expect(workspace.versions).toHaveLength(1);
    expect(workspace.articleHtml).toBe("<article><p>Before</p></article>");
  });
});
