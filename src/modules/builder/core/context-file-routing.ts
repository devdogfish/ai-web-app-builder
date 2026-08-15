const IMAGE_FILE_EXTENSION =
  /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;

export interface ContextFileCandidate {
  name: string;
  type: string;
}

export function isContextImageFile(file: ContextFileCandidate): boolean {
  return file.type.startsWith("image/") || IMAGE_FILE_EXTENSION.test(file.name);
}

export function partitionContextFiles<T extends ContextFileCandidate>(
  files: readonly T[],
): { images: T[]; references: T[] } {
  const images: T[] = [];
  const references: T[] = [];
  for (const file of files) {
    (isContextImageFile(file) ? images : references).push(file);
  }
  return { images, references };
}
