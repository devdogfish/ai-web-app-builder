import type {
  BuilderEnvironment,
  EnvironmentReference,
} from "@/modules/builder/environment/types";

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "complete" | "streaming" | "failed" | "stopped";
export type MessageKind = "chat" | "source_apply" | "rewind" | "baseline";
export type VersionSource = "baseline" | "assistant" | "manual" | "rewind";

export interface BuilderMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  status: MessageStatus;
  versionId: string | null;
  uploadIds: string[];
  errorCode: string | null;
  durationMs: number | null;
  thinkingMs: number | null;
  createdAt: string;
}

export interface ArticleVersion {
  id: string;
  number: number;
  parentVersionId: string | null;
  content: string;
  summary: string;
  source: VersionSource;
  sha256: string;
  createdAt: string;
}

export interface ReferenceUpload {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: "ready" | "failed";
  contextTokenEstimate: number;
  createdAt: string;
}

export interface ReferenceUploadPreview {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "docx" | "image" | "text";
  modelPayload: string;
  rawBytes: Uint8Array | null;
}

export interface BuilderWorkspace {
  environment: BuilderEnvironment;
  needsBootstrap: boolean;
  chatId: string | null;
  articleHtml: string;
  currentVersionId: string | null;
  messages: BuilderMessage[];
  versions: ArticleVersion[];
  uploads: ReferenceUpload[];
  articleImages: BuilderArticleImage[];
  compactMemoryTokenEstimate: number;
  compactedThroughMessageId: string | null;
  hostSyncPending: boolean;
}

export interface BuilderArticleImage {
  id: string;
  position: number;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  needsUpload: boolean;
  revision: string;
  productionPath: string;
  productionUrl: string;
  databasePreviewUrl: string;
  canConvertPngToJpeg: boolean;
}

export type BuilderAction =
  | { type: "apply-source"; content: string }
  | { type: "rewind"; versionId: string }
  | { type: "start-new-session" }
  | {
      type: "bootstrap";
      method: "blank" | "html-paste" | "html-upload" | "docx-upload";
      content?: string;
      uploadId?: string;
    };

export interface BuilderActionRequest {
  environment: EnvironmentReference;
  action: BuilderAction;
}

export interface RefineRequest {
  environment: EnvironmentReference;
  prompt: string;
  uploadIds: string[];
  runtimeError?: string;
}

export type RefineStreamEvent =
  | { type: "status"; message: string }
  | { type: "text-delta"; delta: string }
  | { type: "workspace"; workspace: BuilderWorkspace }
  | { type: "error"; code: string; message: string };

export const PROMPT_PRESETS = [
  {
    id: "clarity",
    label: "Improve clarity",
    prompt:
      "Improve clarity and readability while preserving every verified fact and the article structure.",
  },
  {
    id: "headings",
    label: "Review structure",
    prompt:
      "Review the heading hierarchy and article structure. Make focused changes where needed.",
  },
  {
    id: "accessibility",
    label: "Check accessibility",
    prompt:
      "Improve semantic HTML and accessibility without changing the article's meaning.",
  },
] as const;
