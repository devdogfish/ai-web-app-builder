"use client";

import { useState, type ImgHTMLAttributes } from "react";

export interface RemoteFirstImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  remoteSrc: string;
  databaseSrc: string;
  alt: string;
}

/** Tries production once, then displays the database-backed source on error. */
export function RemoteFirstImage({
  remoteSrc,
  databaseSrc,
  alt,
  onError,
  ...props
}: RemoteFirstImageProps) {
  const [failedRemoteSrc, setFailedRemoteSrc] = useState<string | null>(null);
  const source = failedRemoteSrc === remoteSrc ? databaseSrc : remoteSrc;

  return (
    // Native img is intentional: arbitrary CMS and authenticated DB URLs are
    // host-controlled integration inputs, not Next image-optimization inputs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={source}
      alt={alt}
      onError={(event) => {
        if (source === remoteSrc) setFailedRemoteSrc(remoteSrc);
        onError?.(event);
      }}
    />
  );
}
