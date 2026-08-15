import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createArticleRepository } from "../db";
import type { ArticleWorkspace } from "../db";
import type { BuilderEnvironment } from "../environment/types";

vi.mock("server-only", () => ({}));
vi.mock("../db/server", () => ({ getArticleRepository: vi.fn() }));
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
        uploadIds: workspace.uploads
          .filter((upload) => upload.messageId === message.id)
          .map((upload) => upload.id),
        errorCode: message.errorCode,
        durationMs: message.durationMs,
        thinkingMs: message.thinkingMs,
        createdAt: message.createdAt.toISOString(),
      })) ?? [],
    versions: [],
    uploads:
      workspace?.uploads.map((upload) => ({
        id: upload.id,
        name: upload.name,
        mimeType: upload.mediaType,
        size: upload.sizeBytes,
        tokenEstimate: 0,
        createdAt: upload.createdAt.toISOString(),
      })) ?? [],
    articleImages: [],
    compactMemoryTokenEstimate: 0,
    compactedThroughMessageId: null,
    hostSyncPending: false,
  }),
}));
vi.mock("../environment/request-resolver", () => ({
  resolveAuthorizedEnvironment: vi.fn(async (reference) => reference),
}));
vi.mock("../environment/host-sync", () => ({
  flushHostSync: vi.fn(async () => true),
}));
vi.mock("../content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../content")>()),
  convertSourceToHtml: vi.fn(async () => ({
    html: "<article><p>Imported</p></article>",
    images: [],
    warnings: [],
  })),
  prepareBootstrapHtml: vi.fn(async ({ html }: { html: string }) => html),
}));
vi.mock("../server/component-integration", () => ({
  compileBuilderPreviewSource: vi.fn(),
  formatBuilderSourceDraft: vi.fn(),
  hasActiveComponents: vi.fn(() => true),
  prepareHistoricalSourceForRestore: vi.fn(),
  prepareManagedSourceForSave: vi.fn(async (source: string) => ({
    source,
    compiledHtml: source,
  })),
}));
vi.mock("../uploads/storage", () => ({
  getUploadStore: vi.fn(() => ({
    put: vi.fn(async () => "stored-article.docx"),
    get: vi.fn(),
    remove: vi.fn(async () => undefined),
  })),
}));
vi.mock("../server/refinement", () => ({ runBuilderRefinement: vi.fn() }));

let bootstrapBuilderFromFileAction: typeof import("../server/actions").bootstrapBuilderFromFileAction;
let getArticleRepository: typeof import("../db/server").getArticleRepository;
let runBuilderRefinement: typeof import("../server/refinement").runBuilderRefinement;

const environment = {
  articleId: "article-1",
  articleTitle: "Article title",
  articleSlug: "article-title",
  website: "rbccm",
} as const;

const previousProvider = process.env.AI_PROVIDER;

beforeAll(async () => {
  ({ bootstrapBuilderFromFileAction } = await import("../server/actions"));
  ({ getArticleRepository } = await import("../db/server"));
  ({ runBuilderRefinement } = await import("../server/refinement"));
});

describe("DOCX bootstrap action", () => {
  let repository: ReturnType<typeof createArticleRepository>;

  beforeEach(() => {
    repository = createArticleRepository({ filename: ":memory:" });
    vi.mocked(getArticleRepository).mockReturnValue(repository);
    vi.mocked(runBuilderRefinement).mockReset();
    process.env.AI_PROVIDER = "cohere";
  });

  afterEach(() => {
    repository.close();
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
  });

  it("creates one user turn and does not launch an automatic refinement", async () => {
    const data = new FormData();
    data.set(
      "file",
      new File([new Uint8Array([1])], "article.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    const result = await bootstrapBuilderFromFileAction(environment, data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Start with this Word document.",
      }),
    ]);
    expect(result.data.uploads.map((upload) => upload.name)).toEqual([
      "article.docx",
    ]);
    expect(runBuilderRefinement).not.toHaveBeenCalled();
  });
});
