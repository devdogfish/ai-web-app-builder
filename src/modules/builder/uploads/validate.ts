import { BUILDER_UPLOAD_LIMITS } from "../config/builder";

export interface UploadCandidate {
  name: string;
  size: number;
  type?: string;
}

export type UploadValidationCode =
  | "too_many_files"
  | "file_too_large"
  | "total_too_large"
  | "unsupported_extension"
  | "invalid_name"
  | "invalid_size";

export interface UploadValidationIssue {
  code: UploadValidationCode;
  message: string;
  fileName?: string;
}

export interface UploadValidationResult {
  valid: boolean;
  totalBytes: number;
  issues: UploadValidationIssue[];
}

export function fileExtension(fileName: string): string {
  const baseName = fileName.trim().split(/[\\/]/).pop() ?? "";
  const dot = baseName.lastIndexOf(".");
  return dot > 0 ? baseName.slice(dot).toLowerCase() : "";
}

export function validateReferenceUploads(
  files: readonly UploadCandidate[],
): UploadValidationResult {
  return validateUploads(files, BUILDER_UPLOAD_LIMITS.referenceExtensions);
}

export function validateArticleImageUploads(
  files: readonly UploadCandidate[],
): UploadValidationResult {
  const result = validateUploads(
    files,
    BUILDER_UPLOAD_LIMITS.imageExtensions,
    (file) => file.type?.startsWith("image/") ?? false,
  );
  return result;
}

export function validateBootstrapDocument(
  file: UploadCandidate,
): UploadValidationResult {
  return validateUploads([file], BUILDER_UPLOAD_LIMITS.bootstrapExtensions);
}

function validateUploads(
  files: readonly UploadCandidate[],
  allowedExtensions: readonly string[],
  acceptsWithoutKnownExtension: (file: UploadCandidate) => boolean = () =>
    false,
): UploadValidationResult {
  const issues: UploadValidationIssue[] = [];
  const totalBytes = files.reduce(
    (total, file) => total + Math.max(0, file.size),
    0,
  );

  if (files.length > BUILDER_UPLOAD_LIMITS.maxFilesPerMessage) {
    issues.push({
      code: "too_many_files",
      message: `Select no more than ${BUILDER_UPLOAD_LIMITS.maxFilesPerMessage} files.`,
    });
  }

  for (const file of files) {
    if (!file.name.trim() || file.name.length > 255) {
      issues.push({
        code: "invalid_name",
        message: "Each upload needs a filename no longer than 255 characters.",
      });
    }

    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      issues.push({
        code: "invalid_size",
        fileName: file.name,
        message: `${file.name} has an invalid size.`,
      });
    } else if (file.size > BUILDER_UPLOAD_LIMITS.maxBytesPerFile) {
      issues.push({
        code: "file_too_large",
        fileName: file.name,
        message: `${file.name} exceeds the 20 MB per-file limit.`,
      });
    }

    if (
      !acceptsWithoutKnownExtension(file) &&
      !allowedExtensions.includes(fileExtension(file.name) as never)
    ) {
      issues.push({
        code: "unsupported_extension",
        fileName: file.name,
        message: `${file.name} is not a supported file type.`,
      });
    }
  }

  if (totalBytes > BUILDER_UPLOAD_LIMITS.maxBytesPerMessage) {
    issues.push({
      code: "total_too_large",
      message: "Selected files exceed the 50 MB total limit.",
    });
  }

  return { valid: issues.length === 0, totalBytes, issues };
}

export class UploadValidationError extends Error {
  constructor(readonly validation: UploadValidationResult) {
    super(validation.issues.map((issue) => issue.message).join(" "));
    this.name = "UploadValidationError";
  }
}

export function assertValidReferenceUploads(
  files: readonly UploadCandidate[],
): void {
  const validation = validateReferenceUploads(files);
  if (!validation.valid) throw new UploadValidationError(validation);
}

export function assertValidArticleImageUploads(
  files: readonly UploadCandidate[],
): void {
  const validation = validateArticleImageUploads(files);
  if (!validation.valid) throw new UploadValidationError(validation);
}

export function assertValidBootstrapDocument(file: UploadCandidate): void {
  const validation = validateBootstrapDocument(file);
  if (!validation.valid) throw new UploadValidationError(validation);
}
