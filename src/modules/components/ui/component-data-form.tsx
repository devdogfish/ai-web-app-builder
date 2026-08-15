"use client";

import { useEffect, useId, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/modules/builder/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/modules/builder/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/modules/builder/ui/field";
import { Input } from "@/modules/builder/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/builder/ui/select";
import { Switch } from "@/modules/builder/ui/switch";
import { Textarea } from "@/modules/builder/ui/textarea";
import type {
  ComponentData,
  ComponentFieldSchema,
  ComponentFieldUiHint,
  ComponentSchema,
  ComponentUiHints,
} from "@/modules/components";

export function ComponentDataForm({
  schema,
  uiHints,
  value,
  onChange,
  disabled = false,
}: {
  schema: ComponentSchema;
  uiHints?: ComponentUiHints;
  value: ComponentData;
  onChange: (value: ComponentData) => void;
  disabled?: boolean;
}) {
  const root = schema;
  const hints = uiHints ?? {};
  const entries = Object.entries(root.properties ?? {}).sort(
    ([left], [right]) => {
      const leftOrder = hints[left]?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = hints[right]?.order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.localeCompare(right);
    },
  );

  if (root.type !== "object" || entries.length === 0) {
    return (
      <FieldGroup>
        <JsonField
          path="data"
          label="Component data"
          value={value}
          disabled={disabled}
          onChange={(next) => onChange(asObject(next))}
        />
      </FieldGroup>
    );
  }

  return (
    <FieldGroup>
      {entries.map(([name, fieldSchema]) => {
        const hint = hints[name] ?? {};
        return (
          <SchemaField
            key={name}
            name={name}
            path={name}
            schema={fieldSchema}
            hint={hint}
            allHints={hints}
            value={value[name]}
            required={root.required?.includes(name) ?? false}
            disabled={disabled}
            onChange={(next) => onChange({ ...value, [name]: next })}
          />
        );
      })}
    </FieldGroup>
  );
}

function SchemaField({
  name,
  path,
  schema,
  hint,
  allHints,
  value,
  required,
  disabled,
  onChange,
}: {
  name: string;
  path: string;
  schema: ComponentFieldSchema;
  hint: ComponentFieldUiHint;
  allHints: ComponentUiHints;
  value: unknown;
  required: boolean;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const label = hint.label || humanize(name);
  const help = hint.helpText || schema.description;

  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemHint = allHints[`${path}[]`] ?? {};
    return (
      <FieldSet data-disabled={disabled || undefined}>
        <FieldLegend>{label}</FieldLegend>
        {help ? <FieldDescription>{help}</FieldDescription> : null}
        <FieldGroup>
          {items.map((item, index) => (
            <Card key={index} size="sm">
              <CardHeader>
                <CardTitle>
                  {itemHint.label || singularize(label)} {index + 1}
                </CardTitle>
                <CardAction>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={
                      disabled || items.length <= (schema.minItems ?? 0)
                    }
                    aria-label={`Remove ${itemHint.label || singularize(label)} ${index + 1}`}
                    onClick={() =>
                      onChange(
                        items.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <SchemaValue
                  name={`${itemHint.label || singularize(name)} ${index + 1}`}
                  path={`${path}[]`}
                  schema={schema.items}
                  hint={itemHint}
                  allHints={allHints}
                  value={item}
                  required
                  disabled={disabled}
                  onChange={(next) =>
                    onChange(
                      items.map((current, itemIndex) =>
                        itemIndex === index ? next : current,
                      ),
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </FieldGroup>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            disabled ||
            (schema.maxItems !== undefined && items.length >= schema.maxItems)
          }
          onClick={() =>
            onChange([...items, defaultValueForField(schema.items)])
          }
        >
          <PlusIcon data-icon="inline-start" />
          Add {itemHint.label || singularize(label)}
        </Button>
      </FieldSet>
    );
  }

  return (
    <SchemaValue
      name={name}
      path={path}
      schema={schema}
      hint={hint}
      allHints={allHints}
      value={value}
      required={required}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function SchemaValue({
  name,
  path,
  schema,
  hint,
  allHints,
  value,
  required,
  disabled,
  onChange,
}: {
  name: string;
  path: string;
  schema: ComponentFieldSchema;
  hint: ComponentFieldUiHint;
  allHints: ComponentUiHints;
  value: unknown;
  required: boolean;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const generatedId = useId();
  const id = `component-data-${generatedId}`;
  const label = hint.label || humanize(name);
  const help = hint.helpText || schema.description;

  if (schema.type === "object") {
    const objectValue = asObject(value);
    const entries = Object.entries(schema.properties).sort(
      ([left], [right]) => {
        const leftOrder =
          allHints[`${path}.${left}`]?.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder =
          allHints[`${path}.${right}`]?.order ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.localeCompare(right);
      },
    );
    return (
      <FieldSet data-disabled={disabled || undefined}>
        {hint.control !== "group" ? <FieldLegend>{label}</FieldLegend> : null}
        {help ? <FieldDescription>{help}</FieldDescription> : null}
        <FieldGroup>
          {entries.map(([childName, childSchema]) => {
            const childPath = `${path}.${childName}`;
            return (
              <SchemaField
                key={childName}
                name={childName}
                path={childPath}
                schema={childSchema}
                hint={allHints[childPath] ?? {}}
                allHints={allHints}
                value={objectValue[childName]}
                required={schema.required?.includes(childName) ?? false}
                disabled={disabled}
                onChange={(next) =>
                  onChange({ ...objectValue, [childName]: next })
                }
              />
            );
          })}
        </FieldGroup>
      </FieldSet>
    );
  }

  if (schema.type === "boolean") {
    return (
      <Field orientation="horizontal" data-disabled={disabled || undefined}>
        <FieldContent>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {help ? <FieldDescription>{help}</FieldDescription> : null}
        </FieldContent>
        <Switch
          id={id}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </Field>
    );
  }

  if (schema.type === "choice") {
    const options = normalizeOptions(schema.options ?? []);
    return (
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          items={options}
          value={typeof value === "string" ? value : null}
          disabled={disabled}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={hint.placeholder || `Choose ${label}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {help ? <FieldDescription>{help}</FieldDescription> : null}
      </Field>
    );
  }

  if (schema.type === "array") {
    return (
      <JsonField
        path={path}
        label={label}
        description={help || "Edit this repeatable list as JSON."}
        value={value ?? []}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (schema.type === "html" || hint.control === "textarea") {
    return (
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          placeholder={hint.placeholder}
          required={required}
          disabled={disabled}
          className="min-h-32 font-mono text-xs"
          onChange={(event) => onChange(event.target.value)}
        />
        {help ? <FieldDescription>{help}</FieldDescription> : null}
      </Field>
    );
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={schema.type === "number" ? "number" : "text"}
        value={
          schema.type === "number"
            ? typeof value === "number"
              ? value
              : ""
            : typeof value === "string"
              ? value
              : ""
        }
        placeholder={hint.placeholder}
        required={required}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            schema.type === "number"
              ? event.target.value === ""
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
      {help ? <FieldDescription>{help}</FieldDescription> : null}
    </Field>
  );
}

function JsonField({
  path,
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  path: string;
  label: string;
  description?: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const generatedId = useId();
  const id = `component-json-${generatedId}`;
  const serialized = JSON.stringify(value, null, 2) ?? "null";
  const [draft, setDraft] = useState(serialized);

  useEffect(() => {
    // Keep invalid in-progress text until the backing value actually changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(serialized);
  }, [serialized]);

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        aria-label={`${label} JSON`}
        data-path={path}
        value={draft}
        disabled={disabled}
        className="min-h-32 font-mono text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          try {
            onChange(JSON.parse(event.currentTarget.value));
            event.currentTarget.setCustomValidity("");
          } catch {
            event.currentTarget.setCustomValidity("Enter valid JSON.");
            event.currentTarget.reportValidity();
          }
        }}
      />
      <FieldDescription>
        {description || "Valid JSON is required."}
      </FieldDescription>
    </Field>
  );
}

function normalizeOptions(options: Array<{ label?: string; value: string }>) {
  return options.map((option) => ({
    label: option.label || humanize(option.value),
    value: option.value,
  }));
}

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function singularize(value: string) {
  return value.endsWith("s") && value.length > 1 ? value.slice(0, -1) : value;
}

function defaultValueForField(schema: ComponentFieldSchema): unknown {
  if ("default" in schema && schema.default !== undefined)
    return schema.default;
  switch (schema.type) {
    case "string":
    case "html":
    case "image":
      return "";
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "choice":
      return schema.options[0]?.value ?? "";
    case "array":
      return [];
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties).map(([name, field]) => [
          name,
          defaultValueForField(field),
        ]),
      );
  }
}

function asObject(value: unknown): ComponentData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ComponentData)
    : {};
}
