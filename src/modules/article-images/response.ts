import type { ArticleImageBinary } from "./contracts";

/** Call only after the host route has authenticated access to the Article. */
export function articleImageResponse(image: ArticleImageBinary): Response {
  return new Response(image.bytes as BodyInit, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(image.sizeBytes),
      "Content-Type": image.mediaType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
