import type { ComponentFieldSchema, ComponentSchema } from "./contracts";

export interface ComponentImageValue {
  path: string;
  source: string;
}

/** Finds every populated ImageSource value, including nested array items. */
export function componentImageValues(
  schema: ComponentSchema,
  value: unknown,
): ComponentImageValue[] {
  const found: ComponentImageValue[] = [];
  collectImageValues(schema, value, "data", found);
  return found;
}

export function unavailableComponentImageValues(
  schema: ComponentSchema,
  value: unknown,
  availableSources: ReadonlySet<string>,
): ComponentImageValue[] {
  return componentImageValues(schema, value).filter(
    (image) => !availableSources.has(image.source),
  );
}

function collectImageValues(
  schema: ComponentFieldSchema,
  value: unknown,
  path: string,
  found: ComponentImageValue[],
): void {
  if (schema.type === "image") {
    if (typeof value === "string" && value.length > 0) {
      found.push({ path, source: value });
    }
    return;
  }

  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [name, childSchema] of Object.entries(schema.properties)) {
      collectImageValues(
        childSchema,
        (value as Record<string, unknown>)[name],
        `${path}.${name}`,
        found,
      );
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) return;
    value.forEach((item, index) =>
      collectImageValues(schema.items, item, `${path}[${index}]`, found),
    );
  }
}
