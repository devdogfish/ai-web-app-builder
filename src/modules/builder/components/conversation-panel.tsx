"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIcon,
  FilePenLineIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/modules/builder/ui/alert-dialog";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/modules/builder/ui/attachment";
import {
  AttachmentViewer,
  type AttachmentViewerTarget,
} from "@/modules/builder/components/attachment-viewer";
import { Button } from "@/modules/builder/ui/button";
import { Card, CardContent, CardFooter } from "@/modules/builder/ui/card";
import { Field, FieldLabel } from "@/modules/builder/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/modules/builder/ui/input-group";
import { ScrollArea } from "@/modules/builder/ui/scroll-area";
import { Spinner } from "@/modules/builder/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/modules/builder/ui/tooltip";
import {
  PROMPT_PRESETS,
  type BuilderWorkspace,
  type ReferenceUpload,
} from "@/modules/builder/core/contracts";
import { getUploadPreview } from "@/modules/builder/core/client";
import { hasRefinementInput } from "@/modules/builder/core/refinement-request";
import {
  countVersionDiffLines,
  type VersionDiffStats,
} from "@/modules/builder/core/version-diff";
import type { BuilderEnvironment } from "@/modules/builder/environment/types";
import { cn } from "@/modules/builder/utils";

export function ConversationPanel({
  environment,
  workspace,
  prompt,
  selectedUploadIds,
  generating,
  streamStatus,
  contextPercentage,
  historyCompacted,
  onPromptChange,
  onSelectedUploadIdsChange,
  onUpload,
  onSend,
  onViewVersionDiff,
  onRestoreVersion,
  onStartNewSession,
}: {
  environment: BuilderEnvironment;
  workspace: BuilderWorkspace;
  prompt: string;
  selectedUploadIds: string[];
  generating: boolean;
  streamStatus: string | null;
  contextPercentage: number;
  historyCompacted: boolean;
  onPromptChange: (prompt: string) => void;
  onSelectedUploadIdsChange: (ids: string[]) => void;
  onUpload: (files: File[]) => Promise<void> | void;
  onSend: () => void;
  onViewVersionDiff: (id: string) => void;
  onRestoreVersion: (id: string) => void;
  onStartNewSession: () => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const dragDepthRef = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isPromptMultiline, setIsPromptMultiline] = useState(false);
  const [attachmentTarget, setAttachmentTarget] =
    useState<AttachmentViewerTarget | null>(null);
  const selectedUploads = selectedUploadIds.flatMap((id) => {
    const upload = workspace.uploads.find((item) => item.id === id);
    return upload ? [upload] : [];
  });
  const contextWarning = contextPercentage >= 80;
  const contextCritical = contextPercentage >= 95;
  const canSend = hasRefinementInput(prompt, selectedUploadIds);
  const versionDiffs = useMemo(() => {
    const versionsById = new Map(
      workspace.versions.map((version) => [version.id, version]),
    );

    return new Map(
      workspace.versions.map((version) => {
        const parent = version.parentVersionId
          ? versionsById.get(version.parentVersionId)
          : null;
        return [
          version.id,
          countVersionDiffLines(parent?.content ?? "", version.content),
        ];
      }),
    );
  }, [workspace.versions]);

  function resetDragState() {
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
  }

  async function uploadFiles(files: File[]) {
    await onUpload(files);
    promptRef.current?.focus();
  }

  useLayoutEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;

    function expandWhenNeeded() {
      const currentTextarea = promptRef.current;
      if (!currentTextarea) return;

      if (!prompt) {
        setIsPromptMultiline(false);
        return;
      }

      if (!isPromptMultiline && textareaHasMultipleLines(currentTextarea)) {
        setIsPromptMultiline(true);
      }
    }

    expandWhenNeeded();

    const observer = new ResizeObserver(expandWhenNeeded);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [isPromptMultiline, prompt]);

  return (
    <Card className="min-h-svh gap-0 rounded-none bg-muted/55 py-0 ring-0 lg:h-full lg:min-h-0">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-white pr-3 pl-12">
        <p className="min-w-0 truncate text-sm font-medium">
          {environment.articleTitle}
        </p>
        <div className="shrink-0">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="sm" disabled={generating}>
                  New session
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start a new session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes this Builder Chat, its Versions,
                  uploads, and memory. The latest applied Article HTML becomes
                  Version 1 of the replacement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={onStartNewSession}
                >
                  Start new session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <ScrollArea className="min-h-0 flex-1">
          <div
            role="log"
            aria-label="Conversation"
            className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-3 py-5 sm:px-4 sm:py-6"
          >
            {workspace.messages.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center text-center">
                <div className="max-w-sm space-y-2">
                  <p className="text-sm font-medium">
                    How can I help with this article?
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Ask a question, request a refinement, or edit the source
                    directly in the Workbench.
                  </p>
                </div>
              </div>
            ) : null}
            {workspace.messages.map((message) => {
              const version = workspace.versions.find(
                (item) => item.id === message.versionId,
              );
              const isVersionEvent =
                message.kind === "source_apply" || message.kind === "rewind";

              if (message.role === "user" && !isVersionEvent) {
                return (
                  <article
                    key={message.id}
                    className="ml-auto flex w-full max-w-[92%] flex-col items-end gap-2 sm:max-w-[82%]"
                  >
                    {message.uploadIds.length > 0 ? (
                      <MessageAttachments
                        uploadIds={message.uploadIds}
                        environment={environment}
                        workspace={workspace}
                        onOpen={setAttachmentTarget}
                      />
                    ) : null}
                    {message.content ? (
                      <div className="w-fit max-w-full rounded-2xl bg-muted px-3 py-2.5 text-sm leading-[1.55]">
                        <p className="whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              }

              return (
                <article
                  key={message.id}
                  className="flex min-w-0 flex-col gap-3"
                >
                  {!isVersionEvent ? (
                    <p className="whitespace-pre-wrap text-sm leading-[1.55]">
                      {message.content}
                    </p>
                  ) : null}
                  {message.uploadIds.length > 0 ? (
                    <MessageAttachments
                      uploadIds={message.uploadIds}
                      environment={environment}
                      workspace={workspace}
                      onOpen={setAttachmentTarget}
                    />
                  ) : null}
                  {version ? (
                    <VersionRow
                      version={version}
                      diff={versionDiffs.get(version.id) ?? ZERO_DIFF}
                      isCurrent={version.id === workspace.currentVersionId}
                      disabled={generating}
                      onViewDiff={() => onViewVersionDiff(version.id)}
                      onRestore={() => onRestoreVersion(version.id)}
                    />
                  ) : null}
                  <TurnMeta
                    kind={message.kind}
                    status={message.status}
                    createdAt={message.createdAt}
                  />
                </article>
              );
            })}
            {generating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {streamStatus ?? "Working…"}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="shrink-0 rounded-none border-t-0 bg-transparent p-2">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {workspace.messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {PROMPT_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="default"
                  onClick={() => onPromptChange(preset.prompt)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          ) : null}
          {selectedUploads.length ? (
            <AttachmentGroup>
              {selectedUploads.map((upload, index) => (
                <Attachment
                  key={upload.id}
                  size="sm"
                  className="cursor-pointer"
                >
                  <AttachmentMedia>
                    <PaperclipIcon />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{upload.name}</AttachmentTitle>
                    <AttachmentDescription>
                      {formatBytes(upload.size)}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      aria-label={`Remove ${upload.name}`}
                      onClick={() =>
                        onSelectedUploadIdsChange(
                          selectedUploadIds.filter((id) => id !== upload.id),
                        )
                      }
                    >
                      <XIcon />
                    </AttachmentAction>
                  </AttachmentActions>
                  <AttachmentTrigger
                    aria-label={`View ${upload.name}`}
                    onClick={() =>
                      setAttachmentTarget({ upload, index: index + 1 })
                    }
                  />
                </Attachment>
              ))}
            </AttachmentGroup>
          ) : null}
          <form
            className="relative"
            onDragEnter={(event) => {
              event.preventDefault();
              if (!event.dataTransfer.types.includes("Files") || generating) {
                return;
              }
              dragDepthRef.current += 1;
              setIsDraggingFiles(true);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files") || generating) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setIsDraggingFiles(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const files = Array.from(event.dataTransfer.files);
              resetDragState();
              if (!generating && files.length > 0) void uploadFiles(files);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <span className="sr-only" aria-live="polite">
              {isDraggingFiles ? "Drop files to attach." : ""}
            </span>
            <Field>
              <FieldLabel htmlFor="builder-prompt" className="sr-only">
                Refinement request
              </FieldLabel>
              <InputGroup
                className={cn(
                  "min-h-11 rounded-xl border-border/80 bg-white px-1 shadow-sm has-disabled:bg-white has-disabled:opacity-100",
                  isPromptMultiline &&
                    "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1 py-1",
                )}
              >
                <InputGroupAddon
                  align="inline-start"
                  className={cn(
                    "px-0 py-1 has-[>button]:ml-0",
                    isPromptMultiline &&
                      "col-start-1 row-start-2 w-auto justify-self-start py-0",
                  )}
                >
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    className="size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Add reference uploads"
                    disabled={generating}
                    onClick={() => uploadRef.current?.click()}
                  >
                    <PlusIcon className="size-4.5" />
                  </InputGroupButton>
                </InputGroupAddon>
                <InputGroupTextarea
                  ref={promptRef}
                  id="builder-prompt"
                  rows={1}
                  value={prompt}
                  placeholder="Ask about or refine the article…"
                  disabled={generating}
                  className={cn(
                    "max-h-32 min-h-10 px-2 py-2.5 leading-5",
                    isPromptMultiline &&
                      "col-span-2 col-start-1 row-start-1 w-full px-2.5 pb-1 pt-2",
                  )}
                  onChange={(event) => {
                    setIsPromptMultiline(
                      textareaHasMultipleLines(event.currentTarget),
                    );
                    onPromptChange(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      onSend();
                    }
                  }}
                />
                <InputGroupAddon
                  align="inline-end"
                  className={cn(
                    "gap-1 px-0 py-1 has-[>button]:mr-0",
                    isPromptMultiline &&
                      "col-start-2 row-start-2 w-auto justify-self-end py-0",
                  )}
                >
                  <div
                    role="progressbar"
                    aria-label="Context usage"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={contextPercentage}
                    aria-valuetext={`${contextPercentage}% of context used${historyCompacted ? "; history compacted" : ""}`}
                    className={cn(
                      "hidden h-8 items-center gap-1 px-1 text-[11px] font-medium sm:flex",
                      contextCritical
                        ? "text-destructive"
                        : contextWarning
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {historyCompacted ? (
                      <span
                        className="hidden whitespace-nowrap lg:inline"
                        title="Older conversation turns were compacted"
                      >
                        History compacted
                      </span>
                    ) : null}
                    <span className="min-w-6 text-right tabular-nums">
                      {contextPercentage}%
                    </span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="size-4 -rotate-90"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        strokeWidth="2"
                        className="stroke-current opacity-20"
                      />
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={100 - contextPercentage}
                        strokeLinecap="round"
                        strokeWidth="2"
                        className="stroke-current transition-[stroke-dashoffset] duration-300"
                      />
                    </svg>
                  </div>
                  {generating ? (
                    <InputGroupButton
                      type="button"
                      size="icon-sm"
                      className="size-8"
                      aria-label="Generation in progress"
                      disabled
                    >
                      <Spinner />
                    </InputGroupButton>
                  ) : (
                    <InputGroupButton
                      type="submit"
                      size="icon-sm"
                      aria-label="Send message"
                      disabled={!canSend}
                      className="size-8 bg-foreground text-background hover:bg-foreground/85 hover:text-background"
                    >
                      <SendIcon />
                    </InputGroupButton>
                  )}
                </InputGroupAddon>
              </InputGroup>
            </Field>
            {isDraggingFiles ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/95 text-sm font-medium text-foreground shadow-sm"
              >
                <PaperclipIcon className="mr-2 size-4" />
                Drop files to attach
              </div>
            ) : null}
          </form>
          <input
            ref={uploadRef}
            type="file"
            multiple
            className="hidden"
            accept=".html,.htm,.txt,.md,.pdf,.docx,.css,.js,.png,.jpg,.jpeg,.webp,.gif,.svg"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length > 0) void uploadFiles(files);
            }}
          />
        </div>
      </CardFooter>
      <AttachmentViewer
        environment={environment}
        target={attachmentTarget}
        articleImages={workspace.articleImages}
        onOpenChange={(open) => {
          if (!open) setAttachmentTarget(null);
        }}
      />
    </Card>
  );
}

function MessageAttachments({
  uploadIds,
  environment,
  workspace,
  onOpen,
}: {
  uploadIds: string[];
  environment: BuilderEnvironment;
  workspace: BuilderWorkspace;
  onOpen: (target: AttachmentViewerTarget) => void;
}) {
  return (
    <AttachmentGroup className="w-full gap-0 py-0">
      <div className="ml-auto flex w-max shrink-0 gap-2">
        {uploadIds.map((uploadId, index) => {
          const upload = workspace.uploads.find((item) => item.id === uploadId);
          return upload ? (
            <MessageAttachmentCard
              key={upload.id}
              upload={upload}
              environment={environment}
              index={index + 1}
              onOpen={() => onOpen({ upload, index: index + 1 })}
            />
          ) : null;
        })}
      </div>
    </AttachmentGroup>
  );
}

function MessageAttachmentCard({
  upload,
  environment,
  index,
  onOpen,
}: {
  upload: ReferenceUpload;
  environment: BuilderEnvironment;
  index: number;
  onOpen: () => void;
}) {
  const extension = fileExtension(upload.name);

  return (
    <div className="group relative flex aspect-square w-32 shrink-0 flex-col overflow-hidden rounded-2xl border bg-background p-2.5 shadow-xs transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm sm:w-36">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-2.5">
        <MessageAttachmentPreview
          upload={upload}
          environment={environment}
          index={index}
        />
      </div>
      <div className="mt-2 min-w-0 px-0.5">
        <p
          className="truncate text-xs font-medium leading-4"
          title={upload.name}
        >
          {upload.name}
        </p>
        <p className="truncate text-[10px] leading-4 font-medium tracking-wide text-muted-foreground uppercase">
          {extension || "File"} · {formatBytes(upload.size)}
        </p>
      </div>
      <button
        type="button"
        aria-label={`View ${upload.name}`}
        className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
        onClick={onOpen}
      />
    </div>
  );
}

function MessageAttachmentPreview({
  upload,
  environment,
  index,
}: {
  upload: ReferenceUpload;
  environment: BuilderEnvironment;
  index: number;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const isImage = upload.mimeType.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    void getUploadPreview(environment, upload.id, index)
      .then((preview) => {
        if (cancelled || preview.kind !== "image" || !preview.rawBytes) return;
        const bytes = Uint8Array.from(preview.rawBytes);
        objectUrl = URL.createObjectURL(
          new Blob([bytes.buffer], { type: preview.mimeType }),
        );
        setImageUrl(objectUrl);
      })
      .catch(() => {
        // The attachment remains usable through the viewer if its thumbnail fails.
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [environment, index, isImage, upload.id]);

  if (imageUrl) {
    return (
      // The source is a local object URL made from the user's stored upload.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className="size-full object-contain" />
    );
  }

  return (
    <Image
      src={fileTypeIconPath(upload)}
      width={56}
      height={56}
      alt=""
      className="size-12 sm:size-14"
    />
  );
}

const FILE_TYPE_ICON_PATHS: Record<string, string> = {
  html: "/file-type-icons/html.svg",
  htm: "/file-type-icons/html.svg",
  txt: "/file-type-icons/text.svg",
  md: "/file-type-icons/markdown.svg",
  pdf: "/file-type-icons/pdf.svg",
  docx: "/file-type-icons/word.svg",
  css: "/file-type-icons/css.svg",
  js: "/file-type-icons/javascript.svg",
  png: "/file-type-icons/image.svg",
  jpg: "/file-type-icons/image.svg",
  jpeg: "/file-type-icons/image.svg",
  webp: "/file-type-icons/image.svg",
  gif: "/file-type-icons/image.svg",
  svg: "/file-type-icons/image.svg",
};

function fileTypeIconPath(upload: ReferenceUpload): string {
  const extension = fileExtension(upload.name).toLowerCase();
  return (
    FILE_TYPE_ICON_PATHS[extension] ??
    (upload.mimeType.startsWith("image/")
      ? "/file-type-icons/image.svg"
      : "/file-type-icons/text.svg")
  );
}

function fileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name);
  return match?.[1]?.toUpperCase() ?? "";
}

function VersionRow({
  version,
  diff,
  isCurrent,
  disabled,
  onViewDiff,
  onRestore,
}: {
  version: BuilderWorkspace["versions"][number];
  diff: VersionDiffStats;
  isCurrent: boolean;
  disabled: boolean;
  onViewDiff: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="flex h-10 w-full items-center gap-1 rounded-lg border bg-background pr-1.5 pl-3 shadow-xs">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="min-w-0 truncate text-[0.8125rem] font-medium">
          {version.summary}
        </span>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">
          v{version.number}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="gap-0.5 px-1.5 tabular-nums shadow-none"
              aria-label={`View diff for version ${version.number}: ${diff.additions} additions, ${diff.deletions} deletions`}
              disabled={disabled || version.parentVersionId === null}
              onClick={onViewDiff}
            />
          }
        >
          <span className="text-success">+{diff.additions}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-destructive">-{diff.deletions}</span>
        </TooltipTrigger>
        <TooltipContent>View diff</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Restore version ${version.number}`}
              disabled={disabled || isCurrent}
              onClick={onRestore}
            />
          }
        >
          <Undo2Icon />
        </TooltipTrigger>
        <TooltipContent>Restore</TooltipContent>
      </Tooltip>
    </div>
  );
}

const ZERO_DIFF: VersionDiffStats = { additions: 0, deletions: 0 };

function TurnMeta({
  kind,
  status,
  createdAt,
}: Pick<
  BuilderWorkspace["messages"][number],
  "kind" | "status" | "createdAt"
>) {
  const isSourceEdit = kind === "source_apply";
  const isRewind = kind === "rewind";
  const Icon = isSourceEdit
    ? FilePenLineIcon
    : isRewind
      ? RotateCcwIcon
      : ActivityIcon;
  const label =
    status === "failed"
      ? "Failed"
      : status === "stopped"
        ? "Stopped"
        : isSourceEdit
          ? "Edited source"
          : isRewind
            ? "Reverted version"
            : "Completed";

  return (
    <div
      className={`flex min-h-5 items-center justify-between gap-4 px-0.5 text-xs ${
        status === "failed" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {label}
      </span>
      <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
        {formatRelativeTime(createdAt)}
      </time>
    </div>
  );
}

function formatRelativeTime(createdAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function textareaHasMultipleLines(textarea: HTMLTextAreaElement): boolean {
  if (textarea.value.includes("\n")) return true;

  const styles = getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) +
    Number.parseFloat(styles.paddingBottom);

  return textarea.scrollHeight > Math.ceil(lineHeight + verticalPadding + 1);
}
