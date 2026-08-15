export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface StringFieldSchema {
  type: "string";
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: string;
}

export interface HtmlFieldSchema {
  type: "html";
  description?: string;
  minLength?: number;
  maxLength?: number;
  default?: string;
}

export interface ImageFieldSchema {
  type: "image";
  description?: string;
  default?: string;
}

export interface NumberFieldSchema {
  type: "number";
  description?: string;
  integer?: boolean;
  minimum?: number;
  maximum?: number;
  default?: number;
}

export interface BooleanFieldSchema {
  type: "boolean";
  description?: string;
  default?: boolean;
}

export interface ChoiceFieldSchema {
  type: "choice";
  description?: string;
  options: Array<{ value: string; label?: string }>;
  default?: string;
}

export interface ObjectFieldSchema {
  type: "object";
  description?: string;
  properties: Record<string, ComponentFieldSchema>;
  required?: string[];
  /** Always false for persisted Components. Present to make strictness explicit. */
  additionalProperties?: false;
}

export interface ArrayFieldSchema {
  type: "array";
  description?: string;
  items: ComponentFieldSchema;
  minItems?: number;
  maxItems?: number;
}

export type ComponentFieldSchema =
  | StringFieldSchema
  | HtmlFieldSchema
  | ImageFieldSchema
  | NumberFieldSchema
  | BooleanFieldSchema
  | ChoiceFieldSchema
  | ObjectFieldSchema
  | ArrayFieldSchema;

export type ComponentSchema = ObjectFieldSchema;

export interface ComponentFieldUiHint {
  label?: string;
  helpText?: string;
  placeholder?: string;
  control?:
    | "text"
    | "textarea"
    | "rich-html"
    | "image"
    | "number"
    | "checkbox"
    | "select"
    | "list"
    | "group";
  order?: number;
}

/** Dot paths use `[]` for an array item, for example `tabs[].content`. */
export type ComponentUiHints = Record<string, ComponentFieldUiHint>;
export type ComponentData = Record<string, unknown>;

export interface ComponentDefinitionInput {
  /** Human-readable metadata. Omitted values are derived for legacy callers. */
  name?: string;
  description?: string;
  /** Self-contained React/TSX source. Imports and browser React APIs are forbidden. */
  source: string;
}

export interface ComponentDefinition {
  /** Immutable internal primary key used by managed references. */
  id: string;
  /** Mutable human-facing PascalCase element name derived from Component Name. */
  tag: string;
  /** Mutable human-readable name. */
  name: string;
  description: string;
  source: string;
  /** Transpiled CommonJS retained as an internal render artifact. */
  compiledSource: string;
  schema: ComponentSchema;
  uiHints: ComponentUiHints;
  defaultData: ComponentData;
  sampleData: ComponentData;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ComponentSummary {
  id: string;
  tag: string;
  name: string;
  description: string;
}

export interface ComponentAuthoringPreview {
  source: string;
  tag: string;
  name: string;
  description: string;
  schema: ComponentSchema;
  uiHints: ComponentUiHints;
  defaultData: ComponentData;
  html: string;
}

export interface ComponentSpec {
  id: string;
  tag: string;
  name: string;
  description: string;
  schema: ComponentSchema;
  uiHints: ComponentUiHints;
  defaultData: ComponentData;
  sampleData: ComponentData;
}

export interface ComponentDataIssue {
  path: string;
  code:
    | "required"
    | "unknown_property"
    | "wrong_type"
    | "invalid_value"
    | "too_short"
    | "too_long"
    | "too_few"
    | "too_many"
    | "pattern";
  message: string;
}

export interface ComponentDataValidation {
  valid: boolean;
  issues: ComponentDataIssue[];
}

export class ComponentValidationError extends Error {
  constructor(
    public readonly code:
      | "invalid_tag"
      | "invalid_name"
      | "invalid_description"
      | "invalid_source"
      | "invalid_template"
      | "invalid_schema"
      | "invalid_ui_hints"
      | "invalid_default_data"
      | "invalid_sample_data"
      | "invalid_data",
    message: string,
    public readonly issues: ComponentDataIssue[] = [],
  ) {
    super(message);
    this.name = "ComponentValidationError";
  }
}
