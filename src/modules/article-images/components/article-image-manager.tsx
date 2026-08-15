"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImagePlusIcon,
  Trash2Icon,
} from "lucide-react";

import type { ArticleImageManagerItem } from "../contracts";

export interface ArticleImageManagerProps {
  images: readonly ArticleImageManagerItem[];
  disabled?: boolean;
  onAdd: (files: readonly File[]) => Promise<void> | void;
  onReorder: (orderedImageIds: readonly string[]) => Promise<void> | void;
  onRemove: (imageId: string) => Promise<void> | void;
}

/** Controlled Step-1 editor. The host form owns persistence and error UI. */
export function ArticleImageManager({
  images,
  disabled = false,
  onAdd,
  onReorder,
  onRemove,
}: ArticleImageManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const ordered = [...images].sort((a, b) => a.position - b.position);
  const unavailable = disabled || working;

  async function run(action: () => Promise<void> | void) {
    setWorking(true);
    try {
      await action();
    } finally {
      setWorking(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    const ids = ordered.map((image) => image.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => onReorder(ids));
  }

  function addSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) void run(() => onAdd(files));
  }

  return (
    <section
      className="rounded-xl border bg-card text-card-foreground"
      aria-labelledby="article-images-heading"
      aria-busy={working}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 id="article-images-heading" className="font-semibold">
            Article images
          </h2>
          <p className="text-sm text-muted-foreground">
            Order controls production filenames. CMS upload happens during
            publishing.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={unavailable}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlusIcon className="size-4" />
          Add images
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          disabled={unavailable}
          onChange={addSelected}
        />
      </header>

      {ordered.length === 0 ? (
        <button
          type="button"
          className="m-4 flex min-h-32 w-[calc(100%-2rem)] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground disabled:opacity-50"
          disabled={unavailable}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlusIcon className="size-6" />
          Add the images used by this article
        </button>
      ) : (
        <ol className="divide-y">
          {ordered.map((image, index) => (
            <li key={image.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums"
                aria-label={`Position ${index + 1}`}
              >
                {index + 1}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.databasePreviewUrl}
                alt=""
                className="size-16 shrink-0 rounded-md border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {image.originalName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {image.productionFilename}
                </p>
                {image.needsUpload ? (
                  <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                    Needs upload
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={`Move ${image.originalName} up`}
                  disabled={unavailable || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </IconButton>
                <IconButton
                  label={`Move ${image.originalName} down`}
                  disabled={unavailable || index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </IconButton>
                <IconButton
                  label={`Remove ${image.originalName}`}
                  disabled={unavailable}
                  onClick={() => void run(() => onRemove(image.id))}
                  destructive
                >
                  <Trash2Icon />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function IconButton({
  label,
  disabled,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded-md border disabled:opacity-40 ${
        destructive ? "text-destructive" : "text-muted-foreground"
      } [&_svg]:size-4`}
    >
      {children}
    </button>
  );
}
