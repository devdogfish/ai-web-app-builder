"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { BootstrapPanel } from "@/modules/builder/components/bootstrap-panel";
import {
  COLLAPSED_CONVERSATION_WIDTH,
  constrainConversationWidth,
  MAX_CONVERSATION_WIDTH,
  MIN_CONVERSATION_WIDTH,
} from "@/modules/builder/components/builder-pane-resize";
import { ConversationPanel } from "@/modules/builder/components/conversation-panel";
import { EnvironmentContextDialog } from "@/modules/builder/components/environment-context-dialog";
import { WorkbenchPanel } from "@/modules/builder/components/workbench-panel";
import { Skeleton } from "@/modules/builder/ui/skeleton";
import { useBuilderController } from "@/modules/builder/hooks/use-builder-controller";
import {
  ARTICLE_SYSTEM_INSTRUCTIONS,
  serializeEnvironmentContext,
} from "@/modules/builder/ai/prompt";
import { estimateContextMeter } from "@/modules/builder/content/context-budget";

type MobileView = "conversation" | "workbench";

function triggerResizeHaptic(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}

export function ArticleBuilderPage() {
  const controller = useBuilderController();
  const [mobileView, setMobileView] = useState<MobileView>("conversation");
  const [conversationWidth, setConversationWidth] = useState(50);
  const [resizing, setResizing] = useState(false);
  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const [workbenchTab, setWorkbenchTab] = useState<"preview" | "source">(
    "preview",
  );
  const resizingRef = useRef(false);

  function resizeFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;

    const nextPercentage = ((event.clientX - bounds.left) / bounds.width) * 100;

    setConversationWidth(constrainConversationWidth(nextPercentage));
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.shiftKey ? 10 : 2;
    let nextWidth: number | undefined;

    if (event.key === "ArrowLeft") nextWidth = conversationWidth - delta;
    if (event.key === "ArrowRight") {
      nextWidth =
        conversationWidth === COLLAPSED_CONVERSATION_WIDTH
          ? MIN_CONVERSATION_WIDTH
          : conversationWidth + delta;
    }
    if (event.key === "Home") nextWidth = COLLAPSED_CONVERSATION_WIDTH;
    if (event.key === "End") nextWidth = MAX_CONVERSATION_WIDTH;
    if (nextWidth === undefined) return;

    event.preventDefault();
    setConversationWidth(constrainConversationWidth(nextWidth));
  }

  if (controller.loading && !controller.workspace) {
    return (
      <>
        <EnvironmentContextDialog />
        <main className="builder-shell" aria-label="Loading article builder">
          <div className="builder-layout builder-layout--loading">
            {[0, 1].map((item) => (
              <div key={item} className="builder-loading-pane">
                <div className="space-y-2 border-b p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
                <div className="min-h-0 flex-1 p-4">
                  <Skeleton className="h-72 w-full" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </>
    );
  }

  if (!controller.workspace || controller.workspace.needsBootstrap) {
    return (
      <>
        <EnvironmentContextDialog disabled={controller.loading} />
        <BootstrapPanel
          loading={controller.loading}
          onBlank={() => controller.bootstrap({ method: "blank" })}
          onPaste={(content) =>
            controller.bootstrap({ method: "html-paste", content })
          }
          onFile={controller.bootstrapFile}
        />
      </>
    );
  }

  const selectedUploadTokens = controller.workspace.uploads
    .filter((upload) => controller.selectedUploadIds.includes(upload.id))
    .reduce((sum, upload) => sum + upload.contextTokenEstimate, 0);
  const contextMeter = estimateContextMeter({
    fixedContent: [
      ARTICLE_SYSTEM_INSTRUCTIONS,
      serializeEnvironmentContext(controller.environment),
      controller.workspace.articleHtml,
      controller.prompt,
    ],
    messages: controller.workspace.messages.map((message) => ({
      id: message.id,
      text: message.content,
    })),
    compactedThroughMessageId: controller.workspace.compactedThroughMessageId,
    compactMemoryTokens: controller.workspace.compactMemoryTokenEstimate,
    selectedUploadTokens,
  });

  function selectVersion(versionId: string) {
    setDiffVersionId(null);
    controller.selectVersion(versionId);
  }

  function viewVersionDiff(versionId: string) {
    controller.selectVersion(versionId);
    setDiffVersionId(versionId);
    setWorkbenchTab("source");
    setMobileView("workbench");
  }

  function restoreVersion(versionId: string) {
    setDiffVersionId(null);
    void controller.restoreVersion(versionId);
  }

  return (
    <main className="builder-shell">
      <EnvironmentContextDialog disabled={controller.generating} />
      <nav className="builder-mobile-switcher" aria-label="Builder pane">
        <button
          type="button"
          aria-controls="builder-conversation-pane"
          aria-pressed={mobileView === "conversation"}
          onClick={() => setMobileView("conversation")}
        >
          Chat
        </button>
        <button
          type="button"
          aria-controls="builder-workbench-pane"
          aria-pressed={mobileView === "workbench"}
          onClick={() => setMobileView("workbench")}
        >
          Workbench
        </button>
      </nav>

      <div
        className="builder-layout"
        data-mobile-view={mobileView}
        style={
          {
            "--builder-conversation-width": `${conversationWidth}%`,
          } as CSSProperties
        }
      >
        <section
          id="builder-conversation-pane"
          className="builder-pane builder-pane--conversation"
          aria-label="Builder chat"
          aria-hidden={
            conversationWidth === COLLAPSED_CONVERSATION_WIDTH || undefined
          }
          inert={conversationWidth === COLLAPSED_CONVERSATION_WIDTH}
        >
          <ConversationPanel
            environment={controller.environment}
            workspace={controller.workspace}
            prompt={controller.prompt}
            selectedUploadIds={controller.selectedUploadIds}
            generating={controller.generating}
            streamStatus={controller.streamStatus}
            contextPercentage={contextMeter.percentage}
            historyCompacted={contextMeter.historyCompacted}
            onPromptChange={controller.setPrompt}
            onSelectedUploadIdsChange={controller.setSelectedUploadIds}
            onUpload={controller.addUploads}
            onSend={() => controller.send()}
            onViewVersionDiff={viewVersionDiff}
            onRestoreVersion={restoreVersion}
            onStartNewSession={controller.startNewSession}
          />
        </section>

        <div
          className="builder-divider"
          role="separator"
          aria-label="Resize builder panes"
          aria-orientation="vertical"
          aria-valuemin={COLLAPSED_CONVERSATION_WIDTH}
          aria-valuemax={MAX_CONVERSATION_WIDTH}
          aria-valuenow={Math.round(conversationWidth)}
          tabIndex={0}
          data-resizing={resizing || undefined}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            resizingRef.current = true;
            setResizing(true);
            triggerResizeHaptic(8);
            resizeFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (resizingRef.current) resizeFromPointer(event);
          }}
          onPointerUp={(event) => {
            if (resizingRef.current) triggerResizeHaptic(5);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            resizingRef.current = false;
            setResizing(false);
          }}
          onPointerCancel={() => {
            resizingRef.current = false;
            setResizing(false);
          }}
          onLostPointerCapture={() => {
            resizingRef.current = false;
            setResizing(false);
          }}
        />

        <section
          id="builder-workbench-pane"
          className="builder-pane builder-pane--workbench"
          aria-label="Workbench"
        >
          <WorkbenchPanel
            environment={controller.environment}
            versions={controller.workspace.versions}
            selectedVersion={controller.selectedVersion}
            previousVersion={controller.previousVersion}
            draft={controller.draft}
            runtimeError={controller.runtimeError}
            isCurrentVersion={controller.isCurrentVersion}
            hasDraft={controller.hasDraft}
            generating={controller.generating}
            articleImages={controller.workspace.articleImages}
            diffVersionId={diffVersionId}
            tab={workbenchTab}
            onDraftChange={controller.setDraft}
            onSelectVersion={selectVersion}
            onDiffVersionIdChange={setDiffVersionId}
            onTabChange={setWorkbenchTab}
            onApply={controller.applyDraft}
            onRewind={controller.rewind}
            onRuntimeError={controller.setRuntimeError}
            onFixError={() =>
              controller.send(
                "Fix the Preview runtime error while preserving the intended article behavior.",
                { includeRuntimeError: true },
              )
            }
          />
        </section>
      </div>
    </main>
  );
}
