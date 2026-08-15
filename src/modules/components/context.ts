import type {
  ComponentDefinition,
  ComponentSpec,
  ComponentSummary,
} from "./contracts";

export function toComponentSummary(
  definition: Pick<ComponentDefinition, "id" | "tag" | "name" | "description">,
): ComponentSummary {
  return {
    id: definition.id,
    tag: definition.tag,
    name: definition.name,
    description: definition.description,
  };
}

/** Tiny always-loaded registry context. Never includes Component shell HTML. */
export function serializeComponentSummaryIndex(
  definitions: Iterable<
    Pick<ComponentDefinition, "id" | "tag" | "name" | "description">
  >,
): string {
  return JSON.stringify(
    [...definitions]
      .map((definition) => ({
        tag: definition.tag,
        name: definition.name,
        description: definition.description,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}

export function toComponentSpec(
  definition: ComponentDefinition,
): ComponentSpec {
  return {
    id: definition.id,
    tag: definition.tag,
    name: definition.name,
    description: definition.description,
    schema: structuredClone(definition.schema),
    uiHints: structuredClone(definition.uiHints),
    defaultData: structuredClone(definition.defaultData),
    sampleData: structuredClone(definition.sampleData),
  };
}

/** Progressive-disclosure context. Deliberately excludes locked HTML/CSS/JS. */
export function serializeComponentSpec(
  definition: ComponentDefinition,
): string {
  const spec = toComponentSpec(definition);
  return JSON.stringify(
    {
      tag: spec.tag,
      name: spec.name,
      description: spec.description,
      schema: spec.schema,
      uiHints: spec.uiHints,
      defaultData: spec.defaultData,
      sampleData: spec.sampleData,
    },
    null,
    2,
  );
}
