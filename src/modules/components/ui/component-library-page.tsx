"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowLeftIcon,
  BracesIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  SourceEditor,
  type SourceEditorDiagnostic,
} from "@/modules/builder/components/source-editor";
import {
  createComponentAction,
  deleteComponentAction,
  diagnoseComponentSourceAction,
  previewComponentAction,
  updateComponentAction,
} from "@/modules/components/server/actions";
import type {
  ComponentAuthoringPreview,
  ComponentData,
  ComponentDefinition,
  ComponentDefinitionInput,
} from "@/modules/components";
import { formatComponentSource } from "@/modules/components/format-source";
import { ComponentDataForm } from "@/modules/components/ui/component-data-form";
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
import { Spinner } from "@/modules/builder/ui/spinner";
import { Input } from "@/modules/builder/ui/input";
import { Textarea } from "@/modules/builder/ui/textarea";

const EMPTY_NAME = "New Component";
const EMPTY_DESCRIPTION =
  "Describe when the Builder should use this Component.";
const EMPTY_SOURCE = `type Props = {
  title: string;
  content: React.ReactNode;
};

/** Describe when the Builder should use this Component. */
export default function NewComponent({
  title = "",
  content = "",
}: Props) {
  return (
    <section>
      <h2>{title}</h2>
      <div>{content}</div>
    </section>
  );
}`;

export function ComponentLibraryPage({
  initialDefinitions,
  initialEditingId,
}: {
  initialDefinitions: ComponentDefinition[];
  initialEditingId?: string | null;
}) {
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [editing, setEditing] = useState<ComponentDefinition | "new" | null>(
    () =>
      initialDefinitions.find(
        (definition) => definition.id === initialEditingId,
      ) ?? null,
  );
  const [deleting, setDeleting] = useState<ComponentDefinition | null>(null);
  const [pending, startTransition] = useTransition();

  function save(
    input: ComponentDefinitionInput,
    originalId: string | null,
    closeAfterSave: boolean,
  ) {
    startTransition(async () => {
      const result = originalId
        ? await updateComponentAction(originalId, input)
        : await createComponentAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDefinitions(result.data.definitions);
      setEditing(closeAfterSave ? null : result.data.saved);
      toast.success(originalId ? "Component updated." : "Component created.");
    });
  }

  function remove(definition: ComponentDefinition) {
    startTransition(async () => {
      const result = await deleteComponentAction(definition.id);
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
                Typed TSX compiled into standalone article HTML.
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
              Props become the visual fields Article Editors use.
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
                Add one self-contained TSX file.
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
                key={definition.id}
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
        key={editing === "new" ? "new" : editing?.id}
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
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Managed uses become standalone HTML before deletion.
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
  const propertyCount = Object.keys(definition.schema.properties).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{definition.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {definition.description}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">
            {propertyCount} {propertyCount === 1 ? "prop" : "props"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <pre className="max-h-28 overflow-hidden rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">
          {definition.source}
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
    originalId: string | null,
    closeAfterSave: boolean,
  ) => void;
}) {
  const [name, setName] = useState(definition?.name ?? EMPTY_NAME);
  const [description, setDescription] = useState(
    definition?.description ?? EMPTY_DESCRIPTION,
  );
  const [source, setSource] = useState(definition?.source ?? EMPTY_SOURCE);
  const [preview, setPreview] = useState<ComponentAuthoringPreview | null>(
    null,
  );
  const [previewData, setPreviewData] = useState<ComponentData>({});
  const [previewing, startPreview] = useTransition();
  const [formatting, startFormatting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function inspect() {
    startPreview(async () => {
      const formatted = await formatSource(source);
      if (formatted === null) return;
      const result = await previewComponentAction({
        name,
        description,
        source: formatted,
      });
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setSource(result.data.source);
      setPreview(result.data);
      setPreviewData(result.data.defaultData);
      setError(null);
    });
  }

  function formatOnly() {
    startFormatting(async () => {
      await formatSource(source);
    });
  }

  function submit() {
    void saveSource(source, true);
  }

  async function saveSource(value: string, closeAfterSave: boolean) {
    if (pending || previewing || formatting) return;
    if (!name.trim() || !description.trim() || !value.trim()) {
      setError("Name, Description, and Component Source are required.");
      return;
    }
    const formatted = await formatSource(value);
    if (formatted === null) return;
    onSave(
      { name, description, source: formatted },
      definition?.id ?? null,
      closeAfterSave,
    );
  }

  async function formatSource(value: string): Promise<string | null> {
    try {
      const formatted = await formatComponentSource(value);
      setSource(formatted);
      setPreview(null);
      setError(null);
      return formatted;
    } catch (formatError) {
      setPreview(null);
      setError(errorMessage(formatError));
      return null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {definition ? `Edit ${definition.name}` : "Create Component"}
          </DialogTitle>
          <DialogDescription>
            Write one typed TSX Component. No imports, JSON schema, React hooks,
            or external runtime.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="component-name">Name</FieldLabel>
              <Input
                id="component-name"
                value={name}
                disabled={pending}
                onChange={(event) => {
                  setName(event.target.value);
                  setPreview(null);
                  setError(null);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="component-description">
                Description
              </FieldLabel>
              <Textarea
                id="component-description"
                value={description}
                disabled={pending}
                className="min-h-20"
                onChange={(event) => {
                  setDescription(event.target.value);
                  setPreview(null);
                  setError(null);
                }}
              />
            </Field>
          </div>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="component-source">Component Source</FieldLabel>
            <SourceEditor
              id="component-source"
              value={source}
              readOnly={pending}
              language="tsx"
              ariaLabel="React TypeScript Component Source"
              className="h-[30rem] min-h-[30rem] rounded-lg border text-xs"
              onLint={lintComponentSource}
              onSave={(value) => void saveSource(value, false)}
              onChange={(value) => {
                setSource(value);
                setPreview(null);
                setError(null);
              }}
            />
            <FieldDescription>
              Supported props: string, number, boolean, string unions,
              React.ReactNode, ImageSource, objects, and arrays. Optional
              defaults stay in normal TypeScript.
            </FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>

        {preview ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Generated Article Editor</CardTitle>
                <CardDescription>
                  {preview.name} · {preview.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ComponentDataForm
                  schema={preview.schema}
                  uiHints={preview.uiHints}
                  value={previewData}
                  onChange={setPreviewData}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Rendered sample</CardTitle>
                <CardDescription>
                  Sandboxed standalone HTML output.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <iframe
                  title="Component sample preview"
                  sandbox="allow-scripts"
                  className="h-80 w-full rounded-lg border bg-background"
                  srcDoc={previewDocument(preview.html)}
                />
              </CardContent>
            </Card>
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || previewing || formatting}
              onClick={formatOnly}
            >
              {formatting ? <Spinner data-icon="inline-start" /> : null}
              Format
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || previewing || formatting}
              onClick={inspect}
            >
              {previewing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <EyeIcon data-icon="inline-start" />
              )}
              Check and preview
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || previewing || formatting}
              onClick={submit}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {definition ? "Save Component" : "Create Component"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function previewDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"></head><body>${html}</body></html>`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not format Component Source.";
}

async function lintComponentSource(
  source: string,
): Promise<readonly SourceEditorDiagnostic[]> {
  const result = await diagnoseComponentSourceAction(source);
  if (result.ok) return result.data;
  return [
    {
      from: 0,
      to: Math.min(source.length, 1),
      severity: "error",
      message: result.error,
      source: "Builder",
    },
  ];
}
