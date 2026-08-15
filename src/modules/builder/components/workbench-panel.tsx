"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlocksIcon,
  ChevronDownIcon,
  Code2Icon,
  EyeIcon,
  FileDiffIcon,
  MonitorIcon,
  Redo2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Settings2Icon,
  SmartphoneIcon,
  UnlinkIcon,
  Undo2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ArticlePreview } from "@/modules/builder/components/article-preview";
import { PreviewDevice } from "@/modules/builder/components/preview-device";
import {
  SourceEditor,
  findManagedComponentReferenceRanges,
  readManagedComponentReference,
  type SourceEditorHandle,
  type ManagedComponentReferenceRange,
} from "@/modules/builder/components/source-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/modules/builder/ui/alert-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/modules/builder/ui/alert";
import { Button, buttonVariants } from "@/modules/builder/ui/button";
import { Card, CardContent } from "@/modules/builder/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/modules/builder/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/modules/builder/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/modules/builder/ui/tooltip";
import { Toggle } from "@/modules/builder/ui/toggle";
import { formatBuilderArticleSource } from "@/modules/builder/core/client";
import type {
  ArticleVersion,
  BuilderArticleImage,
} from "@/modules/builder/core/contracts";
import type { BuilderEnvironment } from "@/modules/builder/environment/types";
import { getWebsiteConfig } from "@/modules/builder/environment/websites";
import { ComponentInstanceInspector } from "@/modules/components/ui/component-instance-inspector";
import { unavailableComponentImageValues } from "@/modules/components/image-fields";
import {
  detachComponentDraftAction,
  getComponentSpecAction,
  listComponentSummariesAction,
} from "@/modules/components/server/actions";
import type {
  ComponentData,
  ComponentSpec,
  ComponentSummary,
} from "@/modules/components/contracts";
import { validateComponentData } from "@/modules/components/schema";
import {
  parseArticleSource,
  serializeComponentReference,
  unwrapComponentSourceData,
} from "@/modules/components/source";

export function WorkbenchPanel({
  environment,
  versions,
  selectedVersion,
  previousVersion,
  draft,
  runtimeError,
  isCurrentVersion,
  hasDraft,
  generating,
  articleImages,
  diffVersionId,
  tab,
  onDraftChange,
  onSelectVersion,
  onDiffVersionIdChange,
  onTabChange,
  onApply,
  onRewind,
  onRuntimeError,
  onFixError,
}: {
  environment: BuilderEnvironment;
  versions: ArticleVersion[];
  selectedVersion: ArticleVersion | null;
  previousVersion: ArticleVersion | null;
  draft: string;
  runtimeError: string | null;
  isCurrentVersion: boolean;
  hasDraft: boolean;
  generating: boolean;
  articleImages: readonly BuilderArticleImage[];
  diffVersionId: string | null;
  tab: "preview" | "source";
  onDraftChange: (value: string) => void;
  onSelectVersion: (id: string) => void;
  onDiffVersionIdChange: (id: string | null) => void;
  onTabChange: (tab: "preview" | "source") => void;
  onApply: () => void;
  onRewind: () => void;
  onRuntimeError: (error: string) => void;
  onFixError: () => void;
}) {
  const website = getWebsiteConfig(environment.website);
  const editorRef = useRef<SourceEditorHandle>(null);
  const [previewSize, setPreviewSize] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [previewRevision, setPreviewRevision] = useState(0);
  const pendingApplyRef = useRef<string | null>(null);
  const [activeComponent, setActiveComponent] = useState<{
    index: number;
    id: string;
    data: ComponentData;
  } | null>(null);
  const [componentSpec, setComponentSpec] = useState<ComponentSpec | null>(
    null,
  );
  const [componentSummaries, setComponentSummaries] = useState<
    ComponentSummary[]
  >([]);
  const [componentBusy, setComponentBusy] = useState(false);
  const [confirmDetach, setConfirmDetach] = useState(false);
  const showDiff =
    previousVersion !== null && diffVersionId === selectedVersion?.id;

  const formatSource = useCallback(async (source: string) => {
    try {
      return await formatBuilderArticleSource(source);
    } catch (error) {
      toast.error(`Could not format Source: ${(error as Error).message}`);
      return null;
    }
  }, []);

  const formatDocument = useCallback(async () => {
    const formatted = await formatSource(draft);
    if (formatted !== null && formatted !== draft) onDraftChange(formatted);
  }, [draft, formatSource, onDraftChange]);

  const applyFormattedDraft = useCallback(async () => {
    if (generating || !hasDraft || !isCurrentVersion) return;

    const formatted = await formatSource(draft);
    if (formatted === null) return;
    if (formatted === draft) {
      onApply();
      return;
    }

    pendingApplyRef.current = formatted;
    onDraftChange(formatted);
  }, [
    draft,
    formatSource,
    generating,
    hasDraft,
    isCurrentVersion,
    onApply,
    onDraftChange,
  ]);

  const openManagedComponent = useCallback(
    async (
      selected: ManagedComponentReferenceRange,
      currentSource: string = draft,
    ) => {
      try {
        const reference = readManagedComponentReference(
          currentSource,
          selected,
        );
        const result = await getComponentSpecAction(reference.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const providedData = unwrapComponentSourceData(
          reference.data,
        ) as ComponentData;
        setComponentSpec(result.data);
        setActiveComponent({
          index: selected.index,
          id: reference.id,
          data: mergeComponentData(result.data.defaultData, providedData),
        });
      } catch (error) {
        toast.error((error as Error).message);
      }
    },
    [draft],
  );

  const openInsertedComponent = useCallback(
    (id: string, source: string, start: number) => {
      const references = parseArticleSource(source).references;
      const index = references.findIndex(
        (reference) => reference.start === start && reference.id === id,
      );
      if (index < 0) {
        toast.error("The inserted Component could not be opened.");
        return;
      }
      void openManagedComponent(
        {
          from: references[index]!.start,
          to: references[index]!.end,
          index,
          id,
        },
        source,
      );
    },
    [openManagedComponent],
  );

  const saveComponentData = useCallback(
    async (data: ComponentData) => {
      if (!activeComponent || !componentSpec) return;
      const validation = validateComponentData(componentSpec.schema, data);
      if (!validation.valid) {
        toast.error(
          validation.issues[0]?.message ?? "Component data is invalid.",
        );
        return;
      }
      const unavailableImages = unavailableComponentImageValues(
        componentSpec.schema,
        data,
        new Set(articleImages.map((image) => image.productionPath)),
      );
      if (unavailableImages.length > 0) {
        toast.error(
          `${unavailableImages[0]!.path} must use an image attached to this Article.`,
        );
        return;
      }
      setComponentBusy(true);
      try {
        const selected =
          findManagedComponentReferenceRanges(draft)[activeComponent.index];
        if (!selected || selected.id !== activeComponent.id) {
          throw new Error(
            "The selected Component changed. Open it again and retry.",
          );
        }
        const reference = readManagedComponentReference(draft, selected);
        const replacement = serializeComponentReference(
          { id: activeComponent.id, data },
          componentSpec.schema,
        );
        const updated = `${draft.slice(0, reference.start)}${replacement}${draft.slice(reference.end)}`;
        const formatted = await formatSource(updated);
        if (formatted === null) return;

        setActiveComponent(null);
        setComponentSpec(null);
        if (formatted === draft) {
          onApply();
          return;
        }

        pendingApplyRef.current = formatted;
        onDraftChange(formatted);
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setComponentBusy(false);
      }
    },
    [
      activeComponent,
      componentSpec,
      draft,
      formatSource,
      onApply,
      onDraftChange,
      articleImages,
    ],
  );

  const detachActiveComponent = useCallback(async () => {
    if (!activeComponent) return;
    setComponentBusy(true);
    try {
      const result = await detachComponentDraftAction(
        draft,
        activeComponent.index,
        activeComponent.id,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDraftChange(result.data);
      setConfirmDetach(false);
      setActiveComponent(null);
      setComponentSpec(null);
      toast.success("Component detached into editable HTML.");
    } finally {
      setComponentBusy(false);
    }
  }, [activeComponent, draft, onDraftChange]);

  useEffect(() => {
    let active = true;

    async function refreshComponentSummaries() {
      const result = await listComponentSummariesAction();
      if (active && result.ok) setComponentSummaries(result.data);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshComponentSummaries();
      }
    }

    void refreshComponentSummaries();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (pendingApplyRef.current === null || pendingApplyRef.current !== draft) {
      return;
    }

    pendingApplyRef.current = null;
    onApply();
  }, [draft, onApply]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "s" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      void applyFormattedDraft();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [applyFormattedDraft]);

  useEffect(() => {
    function handleFindShortcut(event: KeyboardEvent) {
      if (
        tab !== "source" ||
        event.defaultPrevented ||
        event.key.toLowerCase() !== "f" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      editorRef.current?.find();
    }

    window.addEventListener("keydown", handleFindShortcut);
    return () => window.removeEventListener("keydown", handleFindShortcut);
  }, [tab]);

  return (
    <Card className="relative min-h-svh gap-0 rounded-none py-0 ring-0 lg:h-full lg:min-h-0">
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as "preview" | "source")}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b bg-white px-3">
            <div className="flex shrink-0 items-center gap-1.5">
              <TabsList aria-label="Workbench view">
                <TabsTrigger value="preview">
                  <EyeIcon />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="source">
                  <Code2Icon />
                  Code
                </TabsTrigger>
              </TabsList>
              {tab === "preview" ? (
                <>
                  <PreviewSizeToggle
                    value={previewSize}
                    onChange={setPreviewSize}
                  />
                  <EditorAction
                    label="Refresh preview"
                    disabled={generating}
                    onClick={() => setPreviewRevision((value) => value + 1)}
                  >
                    <RefreshCwIcon />
                  </EditorAction>
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {!isCurrentVersion ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={generating}
                  onClick={onRewind}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Restore
                </Button>
              ) : null}
              {tab === "source" ? (
                <>
                  <DiffToggle
                    pressed={showDiff}
                    disabled={!previousVersion}
                    onPressedChange={(pressed) =>
                      onDiffVersionIdChange(
                        pressed ? (selectedVersion?.id ?? null) : null,
                      )
                    }
                  />
                  <EditorAction
                    disabled={generating}
                    label="Undo"
                    onClick={() => editorRef.current?.undo()}
                  >
                    <Undo2Icon />
                  </EditorAction>
                  <EditorAction
                    disabled={generating}
                    label="Redo"
                    onClick={() => editorRef.current?.redo()}
                  >
                    <Redo2Icon />
                  </EditorAction>
                  <EditorAction
                    disabled={generating}
                    label="Find and replace"
                    onClick={() => editorRef.current?.find()}
                  >
                    <SearchIcon />
                  </EditorAction>
                  <EditorAction
                    disabled={generating}
                    label="Format document"
                    onClick={() => void formatDocument()}
                  >
                    <Code2Icon />
                  </EditorAction>
                </>
              ) : null}
              <Link
                href="/components"
                target="_blank"
                aria-label="Open Component Library"
                title="Component Library"
                className={buttonVariants({ variant: "ghost", size: "icon" })}
              >
                <BlocksIcon />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      className="min-w-28 justify-between"
                      variant="outline"
                      size="sm"
                      disabled={generating}
                    />
                  }
                >
                  Version {selectedVersion?.number ?? "—"}
                  <ChevronDownIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Version History</DropdownMenuLabel>
                    {[...versions].reverse().map((version) => (
                      <DropdownMenuItem
                        key={version.id}
                        onClick={() => onSelectVersion(version.id)}
                      >
                        v{version.number} · {version.summary}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <TabsContent
            value="preview"
            className="min-h-0 flex-1 overflow-hidden"
          >
            <PreviewDevice mode={previewSize}>
              <ArticlePreview
                key={previewRevision}
                source={draft}
                assetPolicy={website.assetPolicy}
                siteProfile={website.previewProfile}
                title={environment.articleTitle}
                versionId={selectedVersion?.id ?? null}
                images={articleImages}
                onRuntimeError={onRuntimeError}
              />
            </PreviewDevice>
          </TabsContent>
          <TabsContent
            value="source"
            className="min-h-0 flex-1 overflow-hidden"
          >
            <div className="flex h-full min-h-0 flex-col lg:flex-row">
              <SourceEditor
                ref={editorRef}
                className="min-w-0 flex-1"
                value={draft}
                onChange={onDraftChange}
                original={showDiff ? previousVersion.content : undefined}
                readOnly={generating || !isCurrentVersion || showDiff}
                componentSummaries={componentSummaries}
                onManagedComponentClick={openManagedComponent}
                onManagedComponentInsert={openInsertedComponent}
              />
              {activeComponent ? (
                <ComponentInstanceInspector
                  key={`${activeComponent.id}-${activeComponent.index}`}
                  definition={componentSpec}
                  data={activeComponent.data}
                  saving={componentBusy}
                  onClose={() => {
                    setActiveComponent(null);
                    setComponentSpec(null);
                  }}
                  onSave={saveComponentData}
                  onDetach={() => setConfirmDetach(true)}
                  imageOptions={articleImages.map((image) => ({
                    id: image.id,
                    label: image.originalName,
                    productionPath: image.productionPath,
                    previewUrl: image.databasePreviewUrl,
                  }))}
                />
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      {runtimeError ? (
        <Alert variant="destructive" className="rounded-none border-x-0">
          <AlertTitle>Preview runtime error</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{runtimeError}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={generating}
              onClick={onFixError}
            >
              <WandSparklesIcon data-icon="inline-start" />
              Fix with AI
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {hasDraft && isCurrentVersion ? (
        <Card
          size="sm"
          className="unsaved-changes-bar absolute bottom-3 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md flex-row items-center gap-2 rounded-full px-2 py-2 pl-4 shadow-lg"
          aria-label="Unsaved changes"
        >
          <Settings2Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            Unsaved changes
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            disabled={generating}
            onClick={() => {
              pendingApplyRef.current = null;
              setActiveComponent(null);
              setComponentSpec(null);
              onDraftChange(selectedVersion?.content ?? "");
            }}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full px-4"
            aria-keyshortcuts="Meta+S Control+S"
            disabled={generating}
            onClick={() => void applyFormattedDraft()}
          >
            Save
          </Button>
        </Card>
      ) : null}
      <AlertDialog open={confirmDetach} onOpenChange={setConfirmDetach}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <UnlinkIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Detach this Component?</AlertDialogTitle>
            <AlertDialogDescription>
              Its generated HTML will replace the managed reference and become
              freely editable. Later library changes will no longer apply to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={componentBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={componentBusy}
              onClick={() => void detachActiveComponent()}
            >
              Detach into HTML
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function mergeComponentData(
  defaults: ComponentData,
  provided: ComponentData,
): ComponentData {
  return mergeObjects(defaults, provided) as ComponentData;
}

function mergeObjects(defaults: unknown, provided: unknown): unknown {
  if (
    defaults &&
    provided &&
    typeof defaults === "object" &&
    typeof provided === "object" &&
    !Array.isArray(defaults) &&
    !Array.isArray(provided)
  ) {
    const result = { ...(defaults as Record<string, unknown>) };
    for (const [key, value] of Object.entries(
      provided as Record<string, unknown>,
    )) {
      result[key] = mergeObjects(result[key], value);
    }
    return result;
  }
  return provided;
}

function DiffToggle({
  pressed,
  disabled,
  onPressedChange,
}: {
  pressed: boolean;
  disabled: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  const label = pressed ? "Hide changes" : "Show changes";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="size-8 p-0"
            aria-label={label}
            pressed={pressed}
            disabled={disabled}
            onPressedChange={onPressedChange}
          />
        }
      >
        <FileDiffIcon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PreviewSizeToggle({
  value,
  onChange,
}: {
  value: "desktop" | "mobile";
  onChange: (value: "desktop" | "mobile") => void;
}) {
  const nextValue = value === "desktop" ? "mobile" : "desktop";
  const label = `Switch to ${nextValue} preview`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="bg-muted"
            aria-label={label}
            aria-pressed={value === "mobile"}
            onClick={() => onChange(nextValue)}
          />
        }
      >
        {value === "desktop" ? <MonitorIcon /> : <SmartphoneIcon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function EditorAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
