"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  bootstrapFromFile,
  fetchWorkspace,
  refineBuilder,
  runBuilderAction,
  uploadReferences,
} from "@/modules/builder/core/client";
import type {
  ArticleVersion,
  BuilderMessage,
  BuilderWorkspace,
} from "@/modules/builder/core/contracts";
import { hasRefinementInput } from "@/modules/builder/core/refinement-request";
import { useBuilderEnvironment } from "@/modules/builder/environment/provider";

export function useBuilderController() {
  const environment = useBuilderEnvironment();
  const [workspace, setWorkspace] = useState<BuilderWorkspace | null>(null);
  const [loadedEnvironmentKey, setLoadedEnvironmentKey] = useState<
    string | null
  >(null);
  const [settledEnvironmentKey, setSettledEnvironmentKey] = useState<
    string | null
  >(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const environmentKey = [
    environment.articleId,
    environment.articleTitle,
    environment.articleSlug,
    environment.website,
  ].join("\u0000");

  const adopt = useCallback((next: BuilderWorkspace) => {
    setWorkspace(next);
    setSelectedVersionId(next.currentVersionId);
    setDraft(next.articleHtml);
    setSelectedUploadIds([]);
  }, []);

  useEffect(() => {
    let active = true;
    fetchWorkspace(environment)
      .then((next) => {
        if (!active) return;
        adopt(next);
        setLoadedEnvironmentKey(environmentKey);
      })
      .catch((error: Error) => active && toast.error(error.message))
      .finally(() => {
        if (!active) return;
        setSettledEnvironmentKey(environmentKey);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adopt, environment, environmentKey]);

  useEffect(
    () => () => {
      generationAbortRef.current?.abort();
    },
    [environmentKey],
  );

  const visibleWorkspace =
    loadedEnvironmentKey === environmentKey ? workspace : null;

  const versions = useMemo(
    () => workspace?.versions ?? [],
    [workspace?.versions],
  );
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );
  const selectedIndex = selectedVersion
    ? versions.findIndex((version) => version.id === selectedVersion.id)
    : -1;
  const previousVersion: ArticleVersion | null =
    selectedIndex > 0 ? versions[selectedIndex - 1] : null;
  const isCurrentVersion = selectedVersionId === workspace?.currentVersionId;
  const hasDraft = isCurrentVersion && draft !== workspace?.articleHtml;

  const selectVersion = useCallback(
    (versionId: string) => {
      const version = versions.find((item) => item.id === versionId);
      if (!version) return;
      setSelectedVersionId(versionId);
      setDraft(version.content);
      setRuntimeError(null);
    },
    [versions],
  );

  async function action(
    input: Parameters<typeof runBuilderAction>[1],
    success?: string,
  ) {
    const next = await runBuilderAction(environment, input);
    adopt(next);
    if (success) toast.success(success);
  }

  const applyDraft = async () => {
    if (!hasDraft) return;
    try {
      await action({ type: "apply-source", content: draft }, "Saved.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (versionId === workspace?.currentVersionId) return;
    try {
      await action({ type: "rewind", versionId }, "Version restored.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const rewind = async () => {
    if (!selectedVersionId) return;
    await restoreVersion(selectedVersionId);
  };

  const startNewSession = async () => {
    try {
      await action({ type: "start-new-session" }, "New session started.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const bootstrap = async (input: {
    method: "blank" | "html-paste";
    content?: string;
  }) => {
    try {
      setLoading(true);
      await action({ type: "bootstrap", ...input });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const bootstrapFile = async (file: File) => {
    try {
      setLoading(true);
      adopt(await bootstrapFromFile(environment, file));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addUploads = async (files: File[]) => {
    try {
      const next = await uploadReferences(environment, files);
      setWorkspace(next);
      const added = next.uploads.filter(
        (upload) =>
          !workspace?.uploads.some((current) => current.id === upload.id),
      );
      setSelectedUploadIds((current) => [
        ...current,
        ...added.map((upload) => upload.id),
      ]);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const send = async (
    overridePrompt?: string,
    options: { includeRuntimeError?: boolean } = {},
  ) => {
    const requestPrompt = (overridePrompt ?? prompt).trim();
    if (
      !hasRefinementInput(requestPrompt, selectedUploadIds) ||
      generationAbortRef.current
    ) {
      return;
    }
    const abortController = new AbortController();
    const messageCountBeforeRequest = workspace?.messages.length ?? 0;
    generationAbortRef.current = abortController;
    setGenerating(true);
    setStreamStatus("Thinking…");
    setPrompt("");
    const optimistic: BuilderMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      kind: "chat",
      content: requestPrompt,
      status: "complete",
      versionId: null,
      uploadIds: selectedUploadIds,
      errorCode: null,
      createdAt: new Date().toISOString(),
    };
    setWorkspace((current) =>
      current
        ? { ...current, messages: [...current.messages, optimistic] }
        : current,
    );
    try {
      adopt(
        await refineBuilder(
          environment,
          {
            prompt: requestPrompt,
            uploadIds: selectedUploadIds,
            runtimeError: options.includeRuntimeError
              ? (runtimeError ?? undefined)
              : undefined,
          },
          { signal: abortController.signal },
        ),
      );
      setRuntimeError(null);
    } catch (error) {
      if (abortController.signal.aborted) {
        try {
          adopt(
            await recoverStoppedWorkspace(
              environment,
              messageCountBeforeRequest,
            ),
          );
        } catch {
          // Keep the optimistic user message if cancellation recovery fails.
        }
        return;
      }
      try {
        const recovered = await fetchWorkspace(environment);
        adopt(recovered);
        const failedRequest = [...recovered.messages]
          .reverse()
          .find((message) => message.role === "user");
        setSelectedUploadIds(failedRequest?.uploadIds ?? []);
      } catch {
        // Preserve the optimistic state when state recovery is unavailable.
      }
      toast.error((error as Error).message);
    } finally {
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null;
        setGenerating(false);
        setStreamStatus(null);
      }
    }
  };

  const stop = useCallback(() => {
    const activeGeneration = generationAbortRef.current;
    if (!activeGeneration || activeGeneration.signal.aborted) return;
    setStreamStatus("Stopping…");
    activeGeneration.abort();
  }, []);

  return {
    environment,
    workspace: visibleWorkspace,
    selectedVersion,
    previousVersion,
    selectedIndex,
    selectedVersionId,
    draft,
    prompt,
    selectedUploadIds,
    runtimeError,
    loading: loading || settledEnvironmentKey !== environmentKey,
    generating,
    streamStatus,
    isCurrentVersion,
    hasDraft,
    setDraft,
    setPrompt,
    setRuntimeError,
    setSelectedUploadIds,
    selectVersion,
    applyDraft,
    restoreVersion,
    rewind,
    startNewSession,
    bootstrap,
    bootstrapFile,
    addUploads,
    send,
    stop,
  };
}

async function recoverStoppedWorkspace(
  environment: Parameters<typeof fetchWorkspace>[0],
  previousMessageCount: number,
): Promise<BuilderWorkspace> {
  let workspace = await fetchWorkspace(environment);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const newMessages = workspace.messages.slice(previousMessageCount);
    if (
      newMessages.some(
        (message) =>
          message.role === "assistant" && message.status === "stopped",
      )
    ) {
      return workspace;
    }
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    workspace = await fetchWorkspace(environment);
  }
  return workspace;
}
