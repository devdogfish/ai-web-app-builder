"use client";

import { useEffect, useState } from "react";
import { BracesIcon, UnlinkIcon } from "lucide-react";

import { Badge } from "@/modules/builder/ui/badge";
import { Button } from "@/modules/builder/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/builder/ui/dialog";
import { Separator } from "@/modules/builder/ui/separator";
import { ComponentDataForm } from "@/modules/components/ui/component-data-form";
import type { ComponentData, ComponentSpec } from "@/modules/components";

export function ComponentInstanceDialog({
  open,
  definition,
  data,
  saving = false,
  onOpenChange,
  onSave,
  onDetach,
}: {
  open: boolean;
  definition: ComponentSpec | null;
  data: ComponentData;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ComponentData) => void | Promise<void>;
  onDetach: () => void;
}) {
  const [draft, setDraft] = useState(data);

  useEffect(() => {
    // This intentionally resets disposable form state when another instance opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(data);
  }, [data, definition?.id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(52rem,calc(100svh-2rem))] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BracesIcon className="size-4 text-muted-foreground" />
            <DialogTitle>
              {definition ? `Edit ${definition.name}` : "Edit Component"}
            </DialogTitle>
            <Badge variant="secondary">Managed</Badge>
          </div>
          <DialogDescription>
            {definition?.description ||
              "Change this Component's data without changing its shared HTML."}
          </DialogDescription>
        </DialogHeader>

        {definition ? (
          <ComponentDataForm
            schema={definition.schema}
            uiHints={definition.uiHints}
            value={draft}
            onChange={setDraft}
            disabled={saving}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This Component is no longer available in the library. Detach it to
            work with its generated HTML.
          </p>
        )}

        <Separator />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Need to change the HTML?</p>
          <p className="text-sm text-muted-foreground">
            Detaching replaces this managed reference with its generated HTML.
            It will stop receiving updates from the Component Library.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={onDetach}
          >
            <UnlinkIcon data-icon="inline-start" />
            Detach
          </Button>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!definition || saving}
              onClick={() => void onSave(draft)}
            >
              Save data
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
