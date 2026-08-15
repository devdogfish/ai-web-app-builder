"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BracesIcon, PencilIcon, UnlinkIcon, XIcon } from "lucide-react";

import { Button, buttonVariants } from "@/modules/builder/ui/button";
import { Separator } from "@/modules/builder/ui/separator";
import { ComponentDataForm } from "@/modules/components/ui/component-data-form";
import type { ComponentImageOption } from "@/modules/components/ui/component-data-form";
import { unavailableComponentImageValues } from "@/modules/components/image-fields";
import type { ComponentData, ComponentSpec } from "@/modules/components";

export function ComponentInstanceInspector({
  definition,
  data,
  saving = false,
  onClose,
  onSave,
  onDetach,
  imageOptions,
}: {
  definition: ComponentSpec | null;
  data: ComponentData;
  saving?: boolean;
  onClose: () => void;
  onSave: (data: ComponentData) => void | Promise<void>;
  onDetach: () => void;
  imageOptions: readonly ComponentImageOption[];
}) {
  const [draft, setDraft] = useState(data);
  const unavailableImages = definition
    ? unavailableComponentImageValues(
        definition.schema,
        draft,
        new Set(imageOptions.map((option) => option.productionPath)),
      )
    : [];

  useEffect(() => {
    // This intentionally resets disposable form state when another instance opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(data);
  }, [data, definition?.id]);

  return (
    <aside
      aria-label={definition ? `Edit ${definition.name}` : "Edit Component"}
      className="flex h-[45%] min-h-0 w-full shrink-0 flex-col border-t bg-background lg:h-auto lg:w-[22rem] lg:border-t-0 lg:border-l"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-center gap-2">
          <BracesIcon className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold">
            {definition ? definition.name : "Component"}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {definition ? (
            <Link
              href={{
                pathname: "/components",
                query: { edit: definition.id },
              }}
              target="_blank"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <PencilIcon data-icon="inline-start" />
              Edit shell
            </Link>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close Component inspector"
            disabled={saving}
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {definition ? (
          <ComponentDataForm
            schema={definition.schema}
            uiHints={definition.uiHints}
            value={draft}
            onChange={setDraft}
            disabled={saving}
            imageOptions={imageOptions}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Detach this reference to work with its generated HTML.
          </p>
        )}

        <Separator className="my-5" />
        <p className="text-xs text-muted-foreground">
          Article Source stays selectable while this inspector is open.
        </p>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={onDetach}
        >
          <UnlinkIcon data-icon="inline-start" />
          Detach
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!definition || saving || unavailableImages.length > 0}
          onClick={() => void onSave(draft)}
        >
          Save changes
        </Button>
      </footer>
    </aside>
  );
}
