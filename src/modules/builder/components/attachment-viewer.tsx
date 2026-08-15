"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
} from "lucide-react";

import { SourceEditor } from "@/modules/builder/components/source-editor";
import {
  resolveAttachmentImageSources,
  type AttachmentImageSources,
} from "@/modules/builder/core/attachment-image-source";
import { getUploadPreview } from "@/modules/builder/core/client";
import type {
  BuilderArticleImage,
  ReferenceUpload,
  ReferenceUploadPreview,
} from "@/modules/builder/core/contracts";
import type { BuilderEnvironment } from "@/modules/builder/environment/types";
import { Button } from "@/modules/builder/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/modules/builder/ui/dialog";
import { Spinner } from "@/modules/builder/ui/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/modules/builder/ui/tabs";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/modules/builder/ui/toggle-group";
import { formatModelPayload } from "@/modules/builder/uploads/format-model-payload";
import { cn } from "@/modules/builder/utils";

export interface AttachmentViewerTarget {
  upload: ReferenceUpload;
  index: number;
  preview?: ReferenceUploadPreview;
  imagePreviewUrl?: string;
  imageDimensions?: ImageDimensions;
}

interface ImageDimensions {
  width: number;
  height: number;
}

export function AttachmentViewer({
  open,
  environment,
  target,
  articleImages,
  onOpenChange,
}: {
  open: boolean;
  environment: BuilderEnvironment;
  target: AttachmentViewerTarget | null;
  articleImages: readonly BuilderArticleImage[];
  onOpenChange: (open: boolean) => void;
}) {
  const [preview, setPreview] = useState<ReferenceUploadPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("original");
  const [payloadView, setPayloadView] = useState<"formatted" | "raw">(
    "formatted",
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!target) return;
    if (target.preview) return;
    let cancelled = false;

    void getUploadPreview(environment, target.upload.id, target.index)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The attachment could not be loaded.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [environment, target]);

  const activePreview =
    target?.preview ?? (preview?.id === target?.upload.id ? preview : null);
  const hasOriginalView = activePreview?.kind === "docx";
  const isImageTarget = target?.upload.mimeType.startsWith("image/") ?? false;
  const imageSources = resolveAttachmentImageSources(
    target?.upload.name,
    articleImages,
  );

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
  }

  async function copyPayload() {
    if (!activePreview) return;
    await navigator.clipboard.writeText(activePreview.modelPayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "grid max-w-none gap-0 overflow-hidden p-0 sm:max-w-none",
          isImageTarget
            ? "h-auto max-h-[92svh] w-fit max-w-[96vw] grid-rows-[auto]"
            : "h-[min(92svh,900px)] w-[min(96vw,1120px)] grid-rows-[auto_minmax(0,1fr)]",
        )}
      >
        {isImageTarget && target ? (
          <ImageDocumentView
            key={target.upload.id}
            upload={target.upload}
            preview={activePreview}
            sources={imageSources}
            preloadedUrl={target.imagePreviewUrl}
            initialDimensions={target.imageDimensions}
            loadError={error}
          />
        ) : (
          <>
            <DialogHeader className="border-b bg-white px-5 py-4 pr-14">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
                  <FileTextIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate leading-5">
                    {target?.upload.name ?? "Attachment"}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5">
                    {target ? formatBytes(target.upload.size) : ""}
                    {activePreview ? ` · ${activePreview.mimeType}` : ""}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {error ? (
              <div className="flex items-center justify-center p-8 text-sm text-destructive">
                {error}
              </div>
            ) : !activePreview ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Loading attachment…
              </div>
            ) : hasOriginalView ? (
              <Tabs
                value={tab}
                onValueChange={setTab}
                className="min-h-0 min-w-0 gap-0"
              >
                <div className="flex h-11 shrink-0 items-center border-b bg-muted/30 px-4">
                  <TabsList aria-label="Attachment view">
                    <TabsTrigger value="original">Word view</TabsTrigger>
                    <TabsTrigger value="payload">LLM payload</TabsTrigger>
                  </TabsList>
                  {tab === "payload" ? (
                    <PayloadActions
                      view={payloadView}
                      copied={copied}
                      onViewChange={setPayloadView}
                      onCopy={() => void copyPayload()}
                    />
                  ) : null}
                </div>
                <TabsContent
                  value="original"
                  className="min-h-0 min-w-0 overflow-hidden"
                >
                  <WordDocumentView preview={activePreview} />
                </TabsContent>
                <TabsContent
                  value="payload"
                  className="min-h-0 min-w-0 overflow-hidden"
                >
                  <ModelPayloadView
                    payload={activePreview.modelPayload}
                    view={payloadView}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
                <div className="flex h-11 items-center border-b bg-muted/30 px-4">
                  <PayloadActions
                    view={payloadView}
                    copied={copied}
                    onViewChange={setPayloadView}
                    onCopy={() => void copyPayload()}
                  />
                </div>
                <ModelPayloadView
                  payload={activePreview.modelPayload}
                  view={payloadView}
                />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WordDocumentView({ preview }: { preview: ReferenceUploadPreview }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    const styles = styleRef.current;
    if (!body || !styles || !preview.rawBytes) return;
    let cancelled = false;
    body.replaceChildren();
    styles.replaceChildren();
    setRendering(true);
    setError(null);

    void import("docx-preview")
      .then(({ renderAsync }) =>
        renderAsync(preview.rawBytes, body, styles, {
          className: "attachment-docx",
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
        }),
      )
      .then(() => {
        if (!cancelled) setRendering(false);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setRendering(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "The Word view could not be rendered.",
          );
        }
      });

    return () => {
      cancelled = true;
      body.replaceChildren();
      styles.replaceChildren();
    };
  }, [preview]);

  return (
    <div className="relative h-full overflow-auto bg-slate-200/70">
      <div ref={styleRef} />
      {rendering ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/80 text-sm text-muted-foreground backdrop-blur-sm">
          <Spinner />
          Rendering Word document…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-8 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div
        ref={bodyRef}
        className="attachment-word-canvas min-h-full py-6 [&_.attachment-docx-wrapper]:bg-transparent! [&_.attachment-docx-wrapper]:p-0! [&_section.attachment-docx]:mx-auto! [&_section.attachment-docx]:shadow-lg!"
      />
    </div>
  );
}

function ImageDocumentView({
  upload,
  preview,
  sources,
  preloadedUrl,
  initialDimensions,
  loadError,
}: {
  upload: ReferenceUpload;
  preview: ReferenceUploadPreview | null;
  sources: AttachmentImageSources | null;
  preloadedUrl?: string;
  initialDimensions?: ImageDimensions;
  loadError: string | null;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(
    initialDimensions ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!preview?.rawBytes || preloadedUrl) return;
    let cancelled = false;
    const bytes = Uint8Array.from(preview.rawBytes);
    const nextUrl = URL.createObjectURL(
      new Blob([bytes.buffer], { type: preview.mimeType }),
    );
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setObjectUrl(nextUrl);
      setSourceIndex(0);
      setDimensions(null);
      setFailed(false);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(nextUrl);
    };
  }, [preloadedUrl, preview]);

  const candidates = uniqueStrings([
    sources?.remoteUrl,
    sources?.localUrl,
    preloadedUrl,
    objectUrl,
  ]);
  const source = candidates[Math.min(sourceIndex, candidates.length - 1)];
  const displayWidth = dimensions
    ? imageDisplayWidth(dimensions.width, dimensions.height)
    : undefined;

  return (
    <div className="grid min-h-0 grid-rows-[auto_auto] overflow-hidden bg-muted/30">
      <DialogHeader className="border-b bg-white px-5 py-4 pr-14">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
            <ImageIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate leading-5">
              {upload.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Image preview
            </DialogDescription>
          </div>
          <p className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">
            {dimensions
              ? `${dimensions.width} × ${dimensions.height} px · `
              : ""}
            {formatBytes(upload.size)}
          </p>
          {source && !failed ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={source} target="_blank" rel="noreferrer">
                  Open image
                  <ExternalLinkIcon data-icon="inline-end" />
                </a>
              }
            />
          ) : null}
        </div>
      </DialogHeader>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden",
          !source || failed ? "min-h-32 min-w-48 p-5" : "",
        )}
      >
        {source && !failed ? (
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${upload.name} in a new tab`}
            className="block max-w-full outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
            style={displayWidth ? { width: displayWidth } : undefined}
          >
            {/* Native img supports arbitrary CMS, authenticated local, and blob URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source}
              alt={upload.name}
              className={cn(
                "block h-auto object-contain",
                displayWidth
                  ? "w-full max-w-none"
                  : "max-h-[calc(92svh-5rem)] w-auto max-w-[min(96vw,1120px)]",
              )}
              style={
                dimensions
                  ? {
                      aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                    }
                  : undefined
              }
              onLoad={(event) => {
                setFailed(false);
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              onError={() => {
                setDimensions(null);
                if (sourceIndex < candidates.length - 1) {
                  setSourceIndex((current) => current + 1);
                } else {
                  setFailed(true);
                }
              }}
            />
          </a>
        ) : failed ? (
          <p className="text-sm text-destructive">
            The image could not be loaded.
          </p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <Spinner />
        )}
      </div>
    </div>
  );
}

function imageDisplayWidth(width: number, height: number): string {
  const aspectRatio = width / height;
  const heightBoundSvh = formatCssNumber(92 * aspectRatio);
  const reservedHeightRem = formatCssNumber(5 * aspectRatio);

  return `min(${width}px, 96vw, 1120px, calc(${heightBoundSvh}svh - ${reservedHeightRem}rem))`;
}

function formatCssNumber(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function uniqueStrings(
  values: readonly (string | null | undefined)[],
): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function PayloadActions({
  view,
  copied,
  onViewChange,
  onCopy,
}: {
  view: "formatted" | "raw";
  copied: boolean;
  onViewChange: (view: "formatted" | "raw") => void;
  onCopy: () => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <ToggleGroup
        aria-label="Payload display"
        value={[view]}
        onValueChange={(value) => {
          const nextView = value[0];
          if (nextView === "formatted" || nextView === "raw") {
            onViewChange(nextView);
          }
        }}
        variant="outline"
        size="sm"
        spacing={0}
      >
        <ToggleGroupItem value="formatted">Formatted</ToggleGroupItem>
        <ToggleGroupItem value="raw">Raw</ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="sm" onClick={onCopy}>
        {copied ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <CopyIcon data-icon="inline-start" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function ModelPayloadView({
  payload,
  view,
}: {
  payload: string;
  view: "formatted" | "raw";
}) {
  const [formattedResult, setFormattedResult] = useState<{
    source: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void formatModelPayload(payload)
      .then((value) => {
        if (!cancelled) setFormattedResult({ source: payload, value });
      })
      .catch(() => {
        if (!cancelled) setFormattedResult({ source: payload, value: payload });
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  const formattedPayload =
    formattedResult?.source === payload ? formattedResult.value : payload;
  const displayedPayload = view === "formatted" ? formattedPayload : payload;

  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden bg-background">
      <SourceEditor
        ariaLabel={`${view === "formatted" ? "Formatted" : "Raw"} LLM payload`}
        className="min-h-0 min-w-0"
        value={displayedPayload}
        onChange={() => undefined}
        readOnly
      />
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
