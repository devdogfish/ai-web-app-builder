"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  bootstrapFromFile,
  convertArticleImageToJpeg,
  fetchWorkspace,
  refineBuilder,
  removeArticleImage,
  reorderArticleImages,
  runBuilderAction,
  uploadArticleImages,
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

  async function attempt<T>(
    operation: () => Promise<T>,
    withLoading = false,
  ): Promise<T | undefined> {
    if (withLoading) setLoading(true);
    try {
      return await operation();
    } catch (error) {
      toast.error((error as Error).message);
      return undefined;
    } finally {
      if (withLoading) setLoading(false);
    }
  }

  const applyDraft = async () => {
    if (!hasDraft) return;
    await attempt(() =>
      action({ type: "apply-source", content: draft }, "Saved."),
    );
  };

  const restoreVersion = async (versionId: string) => {
    if (versionId === workspace?.currentVersionId) return;
    await attempt(() =>
      action({ type: "rewind", versionId }, "Version restored."),
    );
  };

  const rewind = async () => {
    if (!selectedVersionId) return;
    await restoreVersion(selectedVersionId);
  };

  const startNewSession = async () => {
    await attempt(() =>
      action({ type: "start-new-session" }, "New session started."),
    );
  };

  const bootstrap = async (input: {
    method: "blank" | "html-paste";
    content?: string;
  }) => {
    await attempt(() => action({ type: "bootstrap", ...input }), true);
  };

  const bootstrapFile = async (file: File) => {
    const next = await attempt(
      () => bootstrapFromFile(environment, file),
      true,
    );
    if (next) adopt(next);
  };

  const addUploads = async (files: File[]) => {
    const next = await attempt(() => uploadReferences(environment, files));
    if (!next) return;
    setWorkspace(next);
    const added = next.uploads.filter(
      (upload) =>
        !workspace?.uploads.some((current) => current.id === upload.id),
    );
    setSelectedUploadIds((current) => [
      ...current,
      ...added.map((upload) => upload.id),
    ]);
  };

  const addArticleImages = async (files: File[]): Promise<boolean> => {
    const next = await attempt(() => uploadArticleImages(environment, files));
    if (!next) return false;
    setWorkspace(next);
    toast.success(
      files.length === 1
        ? "Image added to the article."
        : `${files.length} images added to the article.`,
    );
    return true;
  };

  const reorderImages = async (orderedImageIds: string[]): Promise<boolean> => {
    const next = await attempt(() =>
      reorderArticleImages(environment, orderedImageIds),
    );
    if (!next) return false;
    setWorkspace(next);
    return true;
  };

  const removeImage = async (imageId: string): Promise<boolean> => {
    const next = await attempt(() => removeArticleImage(environment, imageId));
    if (!next) return false;
    setWorkspace(next);
    toast.success("Image removed.");
    return true;
  };

  const convertImageToJpeg = async (imageId: string): Promise<boolean> => {
    const next = await attempt(() =>
      convertArticleImageToJpeg(environment, imageId),
    );
    if (!next) return false;
    adopt(next);
    toast.success("Image converted to JPEG.");
    return true;
  };

  const send = async (
    overridePrompt?: string,
    options: { includeRuntimeError?: boolean } = {},
  ) => {
    const requestPrompt = (overridePrompt ?? prompt).trim();
    const requestUploadIds = [...selectedUploadIds];
    if (
      !hasRefinementInput(requestPrompt, requestUploadIds) ||
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
    setSelectedUploadIds([]);
    const optimistic: BuilderMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      kind: "chat",
      content: requestPrompt,
      status: "complete",
      versionId: null,
      uploadIds: requestUploadIds,
      errorCode: null,
      durationMs: null,
      thinkingMs: null,
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
            uploadIds: requestUploadIds,
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
      setPrompt((current) => current || requestPrompt);
      setSelectedUploadIds((current) =>
        current.length > 0 ? current : requestUploadIds,
      );
      try {
        const recovered = await fetchWorkspace(environment);
        adopt(recovered);
        const failedRequest = recovered.messages
          .slice(messageCountBeforeRequest)
          .find((message) => message.role === "user");
        setPrompt(
          (current) => current || failedRequest?.content || requestPrompt,
        );
        setSelectedUploadIds(
          failedRequest?.uploadIds.length
            ? failedRequest.uploadIds
            : requestUploadIds,
        );
      } catch {
        // Keep the submitted composer state available for a manual retry.
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
    addArticleImages,
    reorderImages,
    removeImage,
    convertImageToJpeg,
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
