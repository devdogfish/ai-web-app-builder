"use client";

import { useState, type FormEvent } from "react";
import { InfoIcon } from "lucide-react";

import { useBuilderEnvironmentEditor } from "@/modules/builder/environment/provider";
import type { Website } from "@/modules/builder/environment/types";
import {
  getWebsiteConfig,
  WEBSITES,
} from "@/modules/builder/environment/websites";
import { Button } from "@/modules/builder/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/modules/builder/ui/dialog";
import { Field, FieldLabel } from "@/modules/builder/ui/field";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function EnvironmentContextDialog({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { environment, setWebsite } = useBuilderEnvironmentEditor();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Website>(environment.website);

  function save(event: FormEvent) {
    event.preventDefault();
    setWebsite(draft);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(environment.website);
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="fixed top-2 left-2 z-40 bg-white/90 shadow-sm"
            disabled={disabled}
            aria-label="Switch website"
            title="Switch website"
          />
        }
      >
        <InfoIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Builder website</DialogTitle>
          <DialogDescription>
            The website determines every CMS, preview, and image setting.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-5">
          <Field>
            <FieldLabel htmlFor="context-website">Website</FieldLabel>
            <select
              id="context-website"
              className={selectClassName}
              value={draft}
              onChange={(event) => setDraft(event.target.value as Website)}
            >
              {WEBSITES.map((website) => (
                <option key={website} value={website}>
                  {getWebsiteConfig(website).name}
                </option>
              ))}
            </select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Switch website</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
