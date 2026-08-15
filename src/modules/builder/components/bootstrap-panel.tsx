"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  FileCode2Icon,
  FileTextIcon,
  MessageSquareIcon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/modules/builder/ui/button";
import {
  Card,
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
import { Field, FieldGroup, FieldLabel } from "@/modules/builder/ui/field";
import { Textarea } from "@/modules/builder/ui/textarea";

export function BootstrapPanel({
  loading,
  onBlank,
  onPaste,
  onFile,
}: {
  loading: boolean;
  onBlank: () => void;
  onPaste: (html: string) => void;
  onFile: (file: File) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const docxRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);

  function takeFile(input: HTMLInputElement | null) {
    const file = input?.files?.[0];
    if (file) onFile(file);
    if (input) input.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (loading) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (loading) return;
    const file = Array.from(event.dataTransfer.files).find((item) =>
      /\.(?:docx|html?|htm)$/i.test(item.name),
    );
    if (file) onFile(file);
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card
        className={
          "relative w-full max-w-2xl transition-colors " +
          (dragging ? "bg-muted/70 ring-2 ring-ring" : "")
        }
        onDragEnter={handleDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardHeader>
          <CardTitle>Start the Builder Chat</CardTitle>
          <CardDescription>
            Bring in Source Material or begin with an empty Article HTML field.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => docxRef.current?.click()}
          >
            <FileTextIcon data-icon="inline-start" />
            Upload DOCX
          </Button>
          <input
            ref={docxRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(event) => takeFile(event.currentTarget)}
          />
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => htmlRef.current?.click()}
          >
            <UploadIcon data-icon="inline-start" />
            Upload HTML
          </Button>
          <input
            ref={htmlRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(event) => takeFile(event.currentTarget)}
          />
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setPasteOpen(true)}
          >
            <FileCode2Icon data-icon="inline-start" />
            Paste HTML
          </Button>
          <Button variant="outline" disabled={loading} onClick={onBlank}>
            <MessageSquareIcon data-icon="inline-start" />
            Blank chat
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {dragging
              ? "Drop HTML or DOCX to start."
              : "Drop HTML or DOCX here, or choose an option above. Imported Source Material is cleaned once."}
          </p>
        </CardFooter>
      </Card>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Paste Article HTML</DialogTitle>
            <DialogDescription>
              Complete documents and HTML fragments are both accepted.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0">
            <Field className="min-h-0">
              <FieldLabel htmlFor="bootstrap-html">Article HTML</FieldLabel>
              <Textarea
                id="bootstrap-html"
                className="h-[min(16rem,40svh)] min-h-24 field-sizing-fixed! resize-none overflow-auto font-mono"
                value={html}
                onChange={(event) => setHtml(event.target.value)}
                rows={12}
                spellCheck={false}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!html.trim() || loading}
              onClick={() => {
                onPaste(html);
                setPasteOpen(false);
              }}
            >
              Use Source Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
