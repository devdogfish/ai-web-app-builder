export function articleImagePreviewUrl(
  articleId: string,
  imageId: string,
  productionUrl?: string,
  revision?: string,
): string {
  const route =
    `/api/articles/${encodeURIComponent(articleId)}` +
    `/images/${encodeURIComponent(imageId)}`;
  const query = new URLSearchParams();
  if (productionUrl) query.set("production", productionUrl);
  if (revision) query.set("revision", revision);
  const serialized = query.toString();
  return serialized ? `${route}?${serialized}` : route;
}
