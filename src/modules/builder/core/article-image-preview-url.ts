export function articleImagePreviewUrl(
  articleId: string,
  imageId: string,
): string {
  return (
    `/api/articles/${encodeURIComponent(articleId)}` +
    `/images/${encodeURIComponent(imageId)}`
  );
}
