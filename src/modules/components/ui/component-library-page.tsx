"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowLeftIcon,
  BracesIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  InfoIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/modules/builder/ui/alert";
import {
  createComponentAction,
  deleteComponentAction,
  updateComponentAction,
} from "@/modules/components/server/actions";
import type {
  ComponentDefinition,
  ComponentDefinitionInput,
} from "@/modules/components";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/modules/builder/ui/alert-dialog";
import { Badge } from "@/modules/builder/ui/badge";
import { Button, buttonVariants } from "@/modules/builder/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/modules/builder/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/builder/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/modules/builder/ui/field";
import { Input } from "@/modules/builder/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/modules/builder/ui/tabs";
import { Textarea } from "@/modules/builder/ui/textarea";

const EMPTY_COMPONENT: EditorDraft = {
  type: "",
  description: "",
  htmlTemplate: "",
  schema: JSON.stringify(
    {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    null,
    2,
  ),
  uiHints: "{}",
  defaultData: "{}",
  sampleData: "{}",
};

type EditorDraft = {
  type: string;
  description: string;
  htmlTemplate: string;
  schema: string;
  uiHints: string;
  defaultData: string;
  sampleData: string;
};

export function ComponentLibraryPage({
  initialDefinitions,
}: {
  initialDefinitions: ComponentDefinition[];
}) {
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [editing, setEditing] = useState<ComponentDefinition | "new" | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ComponentDefinition | null>(null);
  const [pending, startTransition] = useTransition();

  function save(input: ComponentDefinitionInput, originalType: string | null) {
    startTransition(async () => {
      const result = originalType
        ? await updateComponentAction(originalType, input)
        : await createComponentAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDefinitions(result.data);
      setEditing(null);
      toast.success(originalType ? "Component updated." : "Component created.");
    });
  }

  function remove(definition: ComponentDefinition) {
    startTransition(async () => {
      const result = await deleteComponentAction(definition.type);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDefinitions(result.data);
      setDeleting(null);
      toast.success("Component deleted. Managed uses were converted to HTML.");
    });
  }

  return (
    <main className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <ArrowLeftIcon />
              <span className="sr-only">Back to Builder</span>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">
                Component Library
              </h1>
              <p className="text-sm text-muted-foreground">
                Reusable, self-contained article HTML.
              </p>
            </div>
          </div>
          <Button onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            New Component
          </Button>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-medium">Available Components</h2>
            <p className="text-sm text-muted-foreground">
              The Builder loads their data fields only when needed.
            </p>
          </div>
          <Badge variant="outline">
            {definitions.length}{" "}
            {definitions.length === 1 ? "Component" : "Components"}
          </Badge>
        </div>

        {definitions.length === 0 ? (
          <Card className="items-center py-12 text-center">
            <CardHeader className="items-center">
              <BracesIcon className="size-8 text-muted-foreground" />
              <CardTitle>No Components yet</CardTitle>
              <CardDescription>
                Add a finished HTML snippet and define the data it accepts.
              </CardDescription>
            </CardHeader>
            <CardFooter className="border-0 bg-transparent p-0">
              <Button onClick={() => setEditing("new")}>
                <PlusIcon data-icon="inline-start" />
                Create Component
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {definitions.map((definition) => (
              <ComponentCard
                key={definition.type}
                definition={definition}
                disabled={pending}
                onEdit={() => setEditing(definition)}
                onDelete={() => setDeleting(definition)}
              />
            ))}
          </div>
        )}
      </section>

      <ComponentEditorDialog
        key={editing === "new" ? "new" : editing?.type}
        definition={editing === "new" ? null : editing}
        open={editing !== null}
        pending={pending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={save}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {deleting?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every managed use will first be replaced with its generated HTML.
              Those articles keep their appearance, but the HTML will no longer
              track this Component.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => deleting && remove(deleting)}
            >
              Delete and convert uses
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ComponentCard({
  definition,
  disabled,
  onEdit,
  onDelete,
}: {
  definition: ComponentDefinition;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const propertyCount = Object.keys(
    (definition.schema as { properties?: object }).properties ?? {},
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono">{definition.type}</CardTitle>
        <CardDescription className="line-clamp-2">
          {definition.description}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {propertyCount} {propertyCount === 1 ? "field" : "fields"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <pre className="max-h-24 overflow-hidden rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">
          {definition.htmlTemplate}
        </pre>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onEdit}>
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}

function ComponentEditorDialog({
  definition,
  open,
  pending,
  onOpenChange,
  onSave,
}: {
  definition: ComponentDefinition | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    input: ComponentDefinitionInput,
    originalType: string | null,
  ) => void;
}) {
  const [draft, setDraft] = useState<EditorDraft>(() =>
    definition ? definitionToDraft(definition) : EMPTY_COMPONENT,
  );
  const [error, setError] = useState<string | null>(null);
  const editing = definition !== null;

  function submit() {
    try {
      const type = draft.type.trim();
      if (!/^[a-z][a-z0-9-]*$/.test(type)) {
        throw new Error(
          "Component Type must use lowercase letters, numbers, and hyphens.",
        );
      }
      if (!draft.description.trim())
        throw new Error("Description is required.");
      if (!draft.htmlTemplate.trim())
        throw new Error("HTML snippet is required.");

      const input = {
        type,
        description: draft.description.trim(),
        htmlTemplate: draft.htmlTemplate,
        schema: parseJson(draft.schema, "Schema"),
        uiHints: parseJson(draft.uiHints, "UI hints"),
        defaultData: parseJson(draft.defaultData, "Default data"),
        sampleData: parseJson(draft.sampleData, "Sample data"),
      } as ComponentDefinitionInput;
      setError(null);
      onSave(input, definition?.type ?? null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${definition.type}` : "Create Component"}
          </DialogTitle>
          <DialogDescription>
            Paste one finished, self-contained HTML snippet, then describe its
            data inputs. Inline style and script tags are supported.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="definition">
          <TabsList>
            <TabsTrigger value="definition">Definition</TabsTrigger>
            <TabsTrigger value="data">Data contract</TabsTrigger>
          </TabsList>
          <TabsContent value="definition" className="pt-2">
            <Alert>
              <InfoIcon />
              <AlertTitle>Bind data inside the snippet</AlertTitle>
              <AlertDescription>
                Use <code>{"{{title}}"}</code> for escaped values,{" "}
                <code>{"{{{content}}}"}</code> for schema fields typed as HTML,
                and <code>{"{{#each items}}…{{/each}}"}</code> for repeatable
                arrays.
              </AlertDescription>
            </Alert>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="component-type">Component Type</FieldLabel>
                <Input
                  id="component-type"
                  value={draft.type}
                  disabled={editing || pending}
                  placeholder="tabs"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  Unique lowercase name used in the Article Source reference.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="component-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="component-description"
                  value={draft.description}
                  disabled={pending}
                  placeholder="Interactive labeled content panels."
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  Short enough to include in the LLM&apos;s Component index.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="component-html">HTML snippet</FieldLabel>
                <Textarea
                  id="component-html"
                  value={draft.htmlTemplate}
                  disabled={pending}
                  spellCheck={false}
                  className="min-h-72 font-mono text-xs"
                  placeholder={
                    '<section class="tabs">…</section>\n<style>…</style>\n<script>…</script>'
                  }
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      htmlTemplate: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  No external component runtime is added. Handoff receives this
                  rendered as ordinary HTML.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </TabsContent>
          <TabsContent value="data" className="pt-2">
            <FieldGroup>
              <JsonEditorField
                id="component-schema"
                label="Schema"
                description="Strict Component prop schema. Supports string, html, image, number, boolean, choice, object, and array fields."
                value={draft.schema}
                disabled={pending}
                onChange={(schema) =>
                  setDraft((current) => ({ ...current, schema }))
                }
              />
              <JsonEditorField
                id="component-ui-hints"
                label="UI hints"
                description="Labels, help text, placeholders, controls, and field order keyed by property path."
                value={draft.uiHints}
                disabled={pending}
                onChange={(uiHints) =>
                  setDraft((current) => ({ ...current, uiHints }))
                }
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <JsonEditorField
                  id="component-default-data"
                  label="Default data"
                  description="Initial values for a new instance."
                  value={draft.defaultData}
                  disabled={pending}
                  onChange={(defaultData) =>
                    setDraft((current) => ({ ...current, defaultData }))
                  }
                />
                <JsonEditorField
                  id="component-sample-data"
                  label="Sample data"
                  description="Representative values for preview and LLM examples."
                  value={draft.sampleData}
                  disabled={pending}
                  onChange={(sampleData) =>
                    setDraft((current) => ({ ...current, sampleData }))
                  }
                />
              </div>
            </FieldGroup>
          </TabsContent>
        </Tabs>

        {error ? <FieldError>{error}</FieldError> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {editing ? "Save Component" : "Create Component"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JsonEditorField({
  id,
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        spellCheck={false}
        className="min-h-40 font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

function definitionToDraft(definition: ComponentDefinition): EditorDraft {
  return {
    type: definition.type,
    description: definition.description,
    htmlTemplate: definition.htmlTemplate,
    schema: JSON.stringify(definition.schema, null, 2),
    uiHints: JSON.stringify(definition.uiHints, null, 2),
    defaultData: JSON.stringify(definition.defaultData, null, 2),
    sampleData: JSON.stringify(definition.sampleData, null, 2),
  };
}

function parseJson(value: string, label: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}
