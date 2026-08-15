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

export interface AttachmentViewerTarget {
  upload: ReferenceUpload;
  index: number;
}

export function AttachmentViewer({
  environment,
  target,
  articleImages,
  onOpenChange,
}: {
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

  const hasOriginalView = preview?.kind === "docx";
  const imageSources = resolveAttachmentImageSources(
    target?.upload.name,
    articleImages,
  );

  function handleOpenChange(open: boolean) {
    if (!open) {
      setPreview(null);
      setError(null);
      setTab("original");
      setPayloadView("formatted");
      setCopied(false);
    }
    onOpenChange(open);
  }

  async function copyPayload() {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.modelPayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={target !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="grid h-[min(92svh,900px)] w-[min(96vw,1120px)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b bg-white px-5 py-4 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
              {preview?.kind === "image" ? (
                <ImageIcon className="size-4" />
              ) : (
                <FileTextIcon className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate leading-5">
                {target?.upload.name ?? "Attachment"}
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {target ? formatBytes(target.upload.size) : ""}
                {preview && preview.kind !== "image"
                  ? ` · ${preview.mimeType}`
                  : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error ? (
          <div className="flex items-center justify-center p-8 text-sm text-destructive">
            {error}
          </div>
        ) : !preview ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading attachment…
          </div>
        ) : preview.kind === "image" ? (
          <ImageDocumentView preview={preview} sources={imageSources} />
        ) : hasOriginalView ? (
          <Tabs value={tab} onValueChange={setTab} className="min-h-0 gap-0">
            <div className="flex h-11 shrink-0 items-center border-b bg-muted/30 px-4">
              <TabsList aria-label="Attachment view">
                <TabsTrigger value="original">
                  {preview.kind === "docx" ? "Word view" : "Image"}
                </TabsTrigger>
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
            <TabsContent value="original" className="min-h-0 overflow-hidden">
              <WordDocumentView preview={preview} />
            </TabsContent>
            <TabsContent value="payload" className="min-h-0 overflow-hidden">
              <ModelPayloadView
                payload={preview.modelPayload}
                view={payloadView}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div className="flex h-11 items-center border-b bg-muted/30 px-4">
              <PayloadActions
                view={payloadView}
                copied={copied}
                onViewChange={setPayloadView}
                onCopy={() => void copyPayload()}
              />
            </div>
            <ModelPayloadView
              payload={preview.modelPayload}
              view={payloadView}
            />
          </div>
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
  preview,
  sources,
}: {
  preview: ReferenceUploadPreview;
  sources: AttachmentImageSources | null;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!preview.rawBytes) return;
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
  }, [preview]);

  const candidates = uniqueStrings([
    sources?.remoteUrl,
    sources?.localUrl,
    objectUrl,
  ]);
  const source = candidates[Math.min(sourceIndex, candidates.length - 1)];

  return (
    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-muted/30">
      <div className="min-h-0 overflow-auto p-5">
        <div className="flex min-h-full items-center justify-center">
          {source && !failed ? (
            <a
              href={source}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${preview.name} in a new tab`}
              className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {/* Native img supports arbitrary CMS, authenticated local, and blob URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source}
                alt={preview.name}
                className="max-h-[calc(92svh-11rem)] max-w-full rounded-lg bg-white object-contain shadow-sm ring-1 ring-foreground/10"
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
          ) : (
            <Spinner />
          )}
        </div>
      </div>
      <div className="flex min-h-12 items-center justify-between gap-4 border-t bg-white px-5 py-2.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          {dimensions
            ? `${dimensions.width} × ${dimensions.height} px · `
            : ""}
          {formatBytes(preview.size)}
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
    </div>
  );
}

function uniqueStrings(
  values: readonly (string | null | undefined)[],
): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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
    <section className="h-full min-h-0 overflow-hidden bg-background">
      <SourceEditor
        ariaLabel={`${view === "formatted" ? "Formatted" : "Raw"} LLM payload`}
        className="min-h-0"
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
