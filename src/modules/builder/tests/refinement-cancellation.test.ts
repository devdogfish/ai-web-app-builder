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
import { ArticleImageRepository } from "../../article-images/repository";
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
  builderArticleImageSources: (
    _environment: BuilderEnvironment,
    images: Array<{ mediaType: string; position: number }>,
  ) =>
    new Set(
      images.map((image) => {
        const extension =
          image.mediaType === "image/png"
            ? "png"
            : image.mediaType === "image/jpeg"
              ? "jpg"
              : "webp";
        return `/media/articles/article-title-${image.position}.${extension}`;
      }),
    ),
  toBuilderWorkspace: (
    environment: BuilderEnvironment,
    workspace: ArticleWorkspace | null,
    articleImages: readonly unknown[] = [],
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
        durationMs: message.durationMs,
        thinkingMs: message.thinkingMs,
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
    articleImages,
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
        durationMs: expect.any(Number),
        thinkingMs: expect.any(Number),
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

  it("loads requested Component specs and then completes the same turn", async () => {
    const requests: Array<{
      componentIndex?: string;
      componentSpecs?: readonly string[];
    }> = [];
    vi.mocked(createArticleModelFromEnv).mockReturnValue({
      provider: "openrouter",
      model: "test",
      async *stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          yield {
            type: "finish",
            result: {
              action: "load_components",
              tags: ["ImageCarousel"],
            },
          } as const;
          return;
        }
        yield {
          type: "finish",
          result: {
            action: "answer",
            response: "The Component spec is loaded.",
          },
        } as const;
      },
    });

    const workspace = await runBuilderRefinement(environment, {
      prompt: "Review the introduction.",
      uploadIds: [],
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.componentIndex).toContain("ImageCarousel");
    expect(requests[0]?.componentSpecs?.join("\n")).not.toContain(
      '"tag": "ImageCarousel"',
    );
    expect(requests[1]?.componentSpecs?.join("\n")).toContain(
      '"tag": "ImageCarousel"',
    );
    expect(requests[1]?.componentSpecs?.join("\n")).not.toContain(
      "htmlTemplate",
    );
    expect(workspace.messages).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: "The Component spec is loaded.",
        status: "complete",
      }),
    );
  });

  it("repairs rejected Component syntax before committing the edit", async () => {
    const prompts: string[] = [];
    new ArticleImageRepository(repository.sqlite).add(environment.articleId, [
      {
        name: "source.webp",
        mediaType: "image/webp",
        bytes: new Uint8Array([1]),
      },
    ]);
    vi.mocked(createArticleModelFromEnv).mockReturnValue({
      provider: "openrouter",
      model: "test",
      async *stream(request) {
        prompts.push(request.currentPrompt);
        yield {
          type: "finish",
          result: {
            action: "edit",
            response: "Converted the quote.",
            summary: "Convert quote",
            articleHtml:
              prompts.length === 1
                ? '<article><Component id="attributed-quote" data={ quote: html`<p>Quote</p>`, author: "Source", image: "/media/articles/article-title-1.webp", imageAlt: "Source" } /></article>'
                : '<article><p><Component id="attributed-quote" data={{ quote: html`<p>Quote</p>`, author: "Source", image: "/media/articles/article-title-1.webp", imageAlt: "Source" }} /></p></article>',
          },
        } as const;
      },
    });

    const workspace = await runBuilderRefinement(environment, {
      prompt: "Use the attributed-quote Component.",
      uploadIds: [],
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("<builder-validation-feedback>");
    expect(prompts[1]).toContain("Expected a restricted data value");
    expect(workspace.messages.at(-1)).toMatchObject({
      role: "assistant",
      status: "complete",
      errorCode: null,
    });
    expect(workspace.versions.at(-1)?.content).toContain(
      '<Component id="attributed-quote"',
    );
    expect(workspace.versions.at(-1)?.content).not.toMatch(/<p>\s*<Component/);
  });

  it("keeps Article Images in the workspace after a successful refinement", async () => {
    new ArticleImageRepository(repository.sqlite).add(environment.articleId, [
      {
        name: "existing.png",
        mediaType: "image/webp",
        bytes: new Uint8Array([1, 2, 3]),
      },
    ]);
    vi.mocked(createArticleModelFromEnv).mockReturnValue({
      provider: "openrouter",
      model: "test",
      async *stream() {
        yield {
          type: "finish",
          result: {
            action: "edit",
            response: "Updated copy.",
            summary: "Update copy",
            articleHtml: "<article><p>After</p></article>",
          },
        } as const;
      },
    });

    const workspace = await runBuilderRefinement(environment, {
      prompt: "Update the copy.",
      uploadIds: [],
    });

    expect(workspace.articleImages).toEqual([
      expect.objectContaining({ originalName: "existing.png" }),
    ]);
  });
});
