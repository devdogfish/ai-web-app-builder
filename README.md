# News Article Content Builder

Next.js Workbench for conversational Article creation and reusable, managed article Components. The features are vertical modules under `src/modules/builder` and `src/modules/components`; App Router files only compose them into this standalone development shell.

## Run

```bash
bun install
cp .env.example .env.local
bun dev
```

Open `http://localhost:3000`. Article identity and website selection live only in React context state and reset to local RBCCM defaults on refresh. Each website uses a separate local Article so switching websites cannot cross Article ownership boundaries.

Open `http://localhost:3000/components` to create, edit, or delete reusable Components.

## Module integration

- `src/modules/builder/components`: complete Builder UI.
- `src/modules/components`: Component contracts, strict data schemas, restricted Article Source parser, compiler, built-ins, persistence, and UI. A Component is one self-contained HTML snippet; inline `<style>` and `<script>` tags are supported.
- `src/modules/builder/environment/request-resolver.ts`: replace the development resolver with the host application's authenticated Article lookup. Production fails closed until wired. The selected `website` derives its fixed CMS, Article type, preview, asset, and image settings.
- `src/modules/builder/environment/article-integration.ts`: read/write the host Article HTML field. Pre-existing HTML becomes baseline Version 1 without an AI call. A durable outbox retries writes in Version order; the host adapter must enforce the supplied idempotency ID and expected-previous hash.
- `src/modules/builder/uploads/storage.ts`: swap `LocalUploadStore` for deployed object/blob storage without touching UI or persistence.
- `src/modules/builder/ai`: provider-neutral `ArticleModel`; OpenRouter and Cohere adapters are selected server-side.
- `src/modules/builder/db`: Drizzle/SQLite repository and migrations. The Builder is its only Article HTML writer.
- `src/modules/builder/config/builder.ts`: upload, context, source, and preview limits/toggles.
- `src/modules/builder/preview/site-profiles.ts`: website-specific preview assets. RBCCM uses locally mirrored production assets; CMWeb is an intentionally empty profile ready for its internal assets.
- `src/modules/builder/scripts/sync-preview-assets.mjs`: refresh the RBCCM non-image mirror with `bun run sync:preview-assets`.

The top-left website button changes only the selected website. Everything else is immutable website configuration in `src/modules/builder/environment/websites.ts`.

Canonical Article Source is ordinary HTML plus managed references such as `<Component type="tabs" data={{ ... }} />`. CodeMirror displays each reference as a single atomic `<Component type="tabs" />` token; clicking it opens the schema-driven data editor. Component HTML stays centralized and unavailable to the LLM. Preview and CMS sync compile references into plain HTML snapshots. Detaching a reference, or deleting its Component definition, permanently materializes its current HTML.

The model always receives the compact Component name/description index and receives full data specs only for Components already used, likely relevant, or explicitly requested through the bounded progressive-disclosure protocol. Word imports provide both structural extraction and bounded rendered page images for high-confidence Component recognition; ambiguous structures remain ordinary HTML.

Rendered Word-page recognition requires LibreOffice's `soffice` and Poppler's `pdftoppm` executables on the server `PATH`. Rendering is best-effort and capped at six pages/15 MB. When either runtime is unavailable, the model is explicitly told that no visual pages were supplied and must use only the structural extract.

RBCCM production images are converted to WebP before the CMS uploader receives them. CMWeb accepts JPEG (recommended), accepts PNG with a warning, and rejects WebP.

The browser calls `getBuilderWorkspaceAction`, `runBuilderActionAction`, `bootstrapBuilderFromFileAction`, `uploadBuilderReferencesAction`, and `refineBuilderAction` from `src/modules/builder/server/actions.ts`; no `/api/builder` Route Handlers are required. Actions return serializable Builder results after completion. Next.js is configured for 52 MB action bodies so the module's 50 MB per-message upload limit still has multipart overhead. Keep the route segment's `maxDuration` at 300 seconds for AI refinement.

Refinement now resolves as one Server Action result. Incremental token streaming and in-flight cancellation are intentionally unavailable: Server Actions return after completion and dispatch sequentially. The UI shows a non-cancellable progress state; provider timeouts still bound execution.

The server also enforces one in-flight refinement per Article, covering duplicate requests from separate tabs or clients. Edit responses carry a validated two-to-four-word completed-change summary; failed messages persist a safe error code while unexpected causes remain in server logs.

Context pressure accumulates every uncompacted conversation turn. At the warning threshold, older turns move into bounded Compact Memory, the newest eight turns remain verbatim, and the UI marks the history as compacted.

The 52 MB Server Action cap is global because uploads share the same transport. Keep authentication, rate limits, and tighter request limits at the host/proxy boundary; every action still validates its own typed input and file limits.

The host app keeps only its Next.js conventions and infrastructure configuration outside the module: a thin `page.tsx`, root layout/global CSS, `public/preview-sites` assets, dependency configuration, and environment variables. `drizzle.config.ts` already targets the module schema and migrations.

For production integration, resolve `articleId`, title, slug, website, and article type from the authenticated server-side article record instead of query parameters.

## Verify

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```
