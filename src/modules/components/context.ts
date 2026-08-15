import type {
  ComponentDefinition,
  ComponentSpec,
  ComponentSummary,
} from "./contracts";

export function toComponentSummary(
  definition: Pick<ComponentDefinition, "type" | "description">,
): ComponentSummary {
  return { type: definition.type, description: definition.description };
}

/** Tiny always-loaded registry context. Never includes Component shell HTML. */
export function serializeComponentSummaryIndex(
  definitions: Iterable<Pick<ComponentDefinition, "type" | "description">>,
): string {
  return JSON.stringify(
    [...definitions].map(toComponentSummary).sort((left, right) => left.type.localeCompare(right.type)),
  );
}

export function toComponentSpec(
  definition: ComponentDefinition,
): ComponentSpec {
  return {
    type: definition.type,
    description: definition.description,
    schema: structuredClone(definition.schema),
    uiHints: structuredClone(definition.uiHints),
    defaultData: structuredClone(definition.defaultData),
    sampleData: structuredClone(definition.sampleData),
  };
}

/** Progressive-disclosure context. Deliberately excludes locked HTML/CSS/JS. */
export function serializeComponentSpec(definition: ComponentDefinition): string {
  return JSON.stringify(toComponentSpec(definition), null, 2);
}
