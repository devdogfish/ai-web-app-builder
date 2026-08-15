export interface ModelUploadSource {
  name: string;
  mediaType: string;
  extractedText: string | null;
}

export function buildModelUploadText(
  upload: ModelUploadSource,
  expectedAssetPath?: string,
): string {
  return (
    upload.extractedText ??
    [
      `Binary reference: ${upload.name} (${upload.mediaType}).`,
      expectedAssetPath
        ? `Expected Article HTML Asset Path: ${expectedAssetPath}`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function serializeModelUpload(upload: {
  id: string;
  index: number;
  name: string;
  mediaType?: string;
  text: string;
}): string {
  return `<reference-upload index="${upload.index}" id=${JSON.stringify(upload.id)} name=${JSON.stringify(upload.name)} media-type=${JSON.stringify(upload.mediaType ?? "text/plain")}>
${upload.text}
</reference-upload>`;
}
