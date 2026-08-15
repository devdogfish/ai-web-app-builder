"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  ExternalLinkIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  ImagesIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";

import type { BuilderArticleImage } from "@/modules/builder/core/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/modules/builder/ui/alert-dialog";
import { Button } from "@/modules/builder/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/modules/builder/ui/dialog";
import { cn } from "@/modules/builder/utils";

interface ArticleImageManagerDialogProps {
  open: boolean;
  images: readonly BuilderArticleImage[];
  articleSource: string;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (files: File[]) => Promise<boolean>;
  onReorder: (orderedImageIds: string[]) => Promise<boolean>;
  onRemove: (imageId: string) => Promise<boolean>;
  onConvertToJpeg: (imageId: string) => Promise<boolean>;
}

export function ArticleImageManagerDialog({
  open,
  images,
  articleSource,
  disabled = false,
  onOpenChange,
  onAdd,
  onReorder,
  onRemove,
  onConvertToJpeg,
}: ArticleImageManagerDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const orderedImages = [...images].sort((a, b) => a.position - b.position);
  const orderedIds = orderedImages.map((image) => image.id);
  const [sourceIds, setSourceIds] = useState(orderedIds);
  const [draftIds, setDraftIds] = useState(orderedIds);
  const [selectedId, setSelectedId] = useState(orderedIds[0] ?? null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const unavailable = disabled || working;

  if (!sameOrder(sourceIds, orderedIds)) {
    setSourceIds(orderedIds);
    setDraftIds(orderedIds);
    setSelectedId((current) =>
      current && orderedIds.includes(current)
        ? current
        : (orderedIds[0] ?? null),
    );
  }

  const imagesById = new Map(orderedImages.map((image) => [image.id, image]));
  const displayed = draftIds.flatMap((id) => {
    const image = imagesById.get(id);
    return image ? [image] : [];
  });
  const selected = selectedId ? (imagesById.get(selectedId) ?? null) : null;
  const needsUploadCount = images.filter((image) => image.needsUpload).length;

  async function run<T>(action: () => Promise<T>): Promise<T> {
    setWorking(true);
    try {
      return await action();
    } finally {
      setWorking(false);
    }
  }

  async function addSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;
    await run(() => onAdd(files));
  }

  function moveDraggedOver(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setDraftIds((current) =>
      moveIdToIndex(current, draggedId, current.indexOf(targetId)),
    );
  }

  async function finishDrag() {
    setDraggedId(null);
    if (sameOrder(draftIds, orderedIds)) return;
    await commitOrder(draftIds);
  }

  async function commitOrder(nextIds: string[]) {
    setDraftIds(nextIds);
    if (!(await run(() => onReorder(nextIds)))) setDraftIds(orderedIds);
  }

  function moveImage(imageId: string, delta: -1 | 1) {
    const currentIndex = draftIds.indexOf(imageId);
    const nextIndex = currentIndex + delta;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= draftIds.length)
      return;
    void commitOrder(moveIdToIndex(draftIds, imageId, nextIndex));
  }

  async function removeSelected() {
    if (!selected) return;
    if (await run(() => onRemove(selected.id))) setConfirmRemove(false);
  }

  async function convertSelected() {
    if (!selected) return;
    await run(() => onConvertToJpeg(selected.id));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="grid h-[min(90svh,860px)] w-[min(96vw,1080px)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b bg-white px-5 py-4 pr-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle>Article images</DialogTitle>
                <DialogDescription className="mt-1">
                  {images.length} {images.length === 1 ? "image" : "images"}
                  {needsUploadCount > 0
                    ? ` · ${needsUploadCount} ${needsUploadCount === 1 ? "needs" : "need"} upload`
                    : images.length > 0
                      ? " · CMS current"
                      : ""}
                </DialogDescription>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={unavailable}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlusIcon data-icon="inline-start" />
                Add images
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.avif,.bmp,.heic,.heif,.tif,.tiff"
              multiple
              className="hidden"
              disabled={unavailable}
              onChange={addSelected}
            />
          </DialogHeader>

          {displayed.length === 0 ? (
            <button
              type="button"
              className="m-5 flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 text-muted-foreground outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/40"
              disabled={unavailable}
              onClick={() => inputRef.current?.click()}
            >
              <span className="flex size-12 items-center justify-center rounded-full border bg-background">
                <ImagesIcon className="size-5" />
              </span>
              <span className="font-medium text-foreground">
                Add article images
              </span>
              <span className="text-xs">
                They’ll appear here in production order.
              </span>
            </button>
          ) : selected ? (
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-zinc-950">
              <div className="group/image relative flex min-h-0 items-center justify-center overflow-hidden p-4 sm:p-6">
                {/* Same-origin authenticated article-image preview. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${selected.id}-${selected.revision}`}
                  src={selected.databasePreviewUrl}
                  alt={selected.originalName}
                  className="size-full object-contain shadow-2xl"
                />
                <a
                  href={selected.databasePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${selected.originalName} full size`}
                  className="absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/70"
                />
                <span className="pointer-events-none absolute top-5 right-5 z-20 inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-black/65 px-3 text-sm font-medium text-white opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover/image:opacity-100 group-focus-within/image:opacity-100">
                  Open full size
                  <ExternalLinkIcon className="size-4" />
                </span>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pt-16 pb-5 text-white opacity-0 transition-opacity group-hover/image:opacity-100 group-focus-within/image:opacity-100 sm:px-6">
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {selected.originalName}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-white/65">
                        {selected.productionPath}
                      </p>
                      <p className="mt-1 text-xs text-white/65">
                        {formatBytes(selected.sizeBytes)} · {selected.mediaType}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-xs font-medium",
                        selected.needsUpload
                          ? "bg-amber-300 text-amber-950"
                          : "bg-emerald-300 text-emerald-950",
                      )}
                    >
                      {selected.needsUpload ? "Needs upload" : "CMS current"}
                    </span>
                  </div>
                </div>
                {selected.canConvertPngToJpeg &&
                articleSource.includes(selected.productionPath) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute right-5 bottom-20 z-30 opacity-0 shadow-lg transition-opacity group-hover/image:opacity-100 group-focus-within/image:opacity-100 sm:right-6"
                    disabled={unavailable}
                    onClick={() => void convertSelected()}
                  >
                    <RefreshCwIcon />
                    Convert to JPEG
                  </Button>
                ) : null}
              </div>

              <div className="border-t border-white/10 bg-background px-3 py-2.5 text-foreground sm:px-4 sm:py-3">
                <div className="flex items-center gap-3">
                  <ol
                    aria-label="Article images in production order"
                    className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1"
                  >
                    {displayed.map((image, index) => (
                      <li
                        key={image.id}
                        draggable={!unavailable}
                        className={cn(
                          "group relative aspect-square size-16 shrink-0 overflow-hidden rounded-lg border bg-muted shadow-xs transition duration-150 sm:size-20",
                          selectedId === image.id
                            ? "border-foreground ring-2 ring-foreground/20"
                            : "hover:border-foreground/40",
                          draggedId === image.id && "scale-95 opacity-45",
                        )}
                        onDragStart={(event: DragEvent<HTMLLIElement>) => {
                          setDraggedId(image.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", image.id);
                        }}
                        onDragEnter={() => moveDraggedOver(image.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDragEnd={() => void finishDrag()}
                      >
                        {/* Same-origin authenticated article-image preview. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.databasePreviewUrl}
                          alt=""
                          draggable={false}
                          className="size-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`View ${image.originalName}. Position ${index + 1}.`}
                          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                          className="absolute inset-0 z-10 rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
                          onClick={() => setSelectedId(image.id)}
                          onKeyDown={(event) => {
                            if (!event.altKey || unavailable) return;
                            if (event.key === "ArrowLeft") {
                              event.preventDefault();
                              moveImage(image.id, -1);
                            }
                            if (event.key === "ArrowRight") {
                              event.preventDefault();
                              moveImage(image.id, 1);
                            }
                          }}
                        />
                        <span className="pointer-events-none absolute top-1 left-1 z-20 flex size-5 items-center justify-center rounded bg-black/65 text-[10px] font-semibold text-white tabular-nums backdrop-blur-sm">
                          {index + 1}
                        </span>
                        <span className="pointer-events-none absolute bottom-1 left-1 z-20 flex size-5 items-center justify-center rounded bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                          <GripVerticalIcon className="size-3.5" />
                        </span>
                        {image.needsUpload ? (
                          <span
                            aria-label="Needs upload"
                            className="pointer-events-none absolute right-1 bottom-1 z-20 size-2.5 rounded-full bg-amber-300 ring-2 ring-black/45"
                          />
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Remove ${image.originalName}`}
                          className="absolute top-1 right-1 z-30 flex size-6 items-center justify-center rounded-md bg-black/65 text-white opacity-0 outline-none backdrop-blur-sm transition-opacity hover:bg-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100"
                          disabled={unavailable}
                          onClick={() => {
                            setSelectedId(image.id);
                            setConfirmRemove(true);
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    className="flex aspect-square size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-20"
                    disabled={unavailable}
                    onClick={() => inputRef.current?.click()}
                  >
                    <ImagePlusIcon className="size-5" />
                    Add
                  </button>
                </div>
                <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                  Drag to reorder · Position sets the production filename
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this image?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stored image. Later images move forward and are
              marked for upload. Article source is not edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={unavailable}
              onClick={() => void removeSelected()}
            >
              Remove image
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ArticleImageStackTrigger({
  images,
  onClick,
}: {
  images: readonly BuilderArticleImage[];
  onClick: () => void;
}) {
  if (images.length === 0) return null;
  const ordered = [...images].sort((a, b) => a.position - b.position);

  return (
    <button
      type="button"
      className="group flex h-9 items-center rounded-lg px-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`Manage ${images.length} article ${images.length === 1 ? "image" : "images"}`}
      title="Manage article images"
      onClick={onClick}
    >
      <span className="flex items-center pl-3 group-hover:pl-1.5">
        {ordered.map((image, index) => (
          <span
            key={image.id}
            className="relative -ml-3 block size-7 shrink-0 overflow-hidden rounded-md border-2 border-white bg-muted shadow-sm transition-[margin] duration-200 first:ml-0 group-hover:-ml-1.5"
            style={{ zIndex: ordered.length - index }}
          >
            {/* Same-origin authenticated article-image preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.databasePreviewUrl}
              alt=""
              className="size-full object-cover"
            />
          </span>
        ))}
      </span>
      <span className="ml-1.5 text-xs font-medium tabular-nums text-muted-foreground">
        {images.length}
      </span>
    </button>
  );
}

function moveIdToIndex(
  ids: string[],
  id: string,
  targetIndex: number,
): string[] {
  const currentIndex = ids.indexOf(id);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ids.length)
    return ids;
  const next = [...ids];
  next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, id);
  return next;
}

function sameOrder(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}
