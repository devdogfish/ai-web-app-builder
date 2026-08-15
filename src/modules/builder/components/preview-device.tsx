import type { ReactNode } from "react";

export function PreviewDevice({
  mode,
  children,
}: {
  mode: "desktop" | "mobile";
  children: ReactNode;
}) {
  return (
    <div className="preview-stage" data-preview-size={mode}>
      <div className="preview-device-slot">
        <div className="preview-device">
          <div className="preview-viewport">{children}</div>
        </div>
      </div>
    </div>
  );
}
