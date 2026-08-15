"use server";

import { revalidatePath } from "next/cache";

import {
  detachComponentReference,
  formatComponentSource,
  parseArticleSource,
  prepareComponentDefinition,
  renderComponentHtml,
  toComponentSpec,
  type ComponentAuthoringPreview,
  type ComponentDefinition,
  type ComponentDefinitionInput,
  type ComponentSpec,
  type ComponentSummary,
} from "@/modules/components";
import { getComponentRepository } from "@/modules/components/server";
import {
  diagnoseComponentSource,
  type ComponentSourceDiagnostic,
} from "@/modules/components/diagnostics";

export type ComponentActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

export interface ComponentMutationResult {
  definitions: ComponentDefinition[];
  saved: ComponentDefinition;
}

export async function listComponentDefinitionsAction(): Promise<
  ComponentActionResult<ComponentDefinition[]>
> {
  return run(() => getComponentRepository().list());
}

/** Small client-safe catalog used by Article Source autocomplete. */
export async function listComponentSummariesAction(): Promise<
  ComponentActionResult<ComponentSummary[]>
> {
  return run(() => getComponentRepository().listSummaries());
}

export async function createComponentAction(
  input: ComponentDefinitionInput,
): Promise<ComponentActionResult<ComponentMutationResult>> {
  return save(() => getComponentRepository().create(input));
}

export async function previewComponentAction(
  input: ComponentDefinitionInput,
): Promise<ComponentActionResult<ComponentAuthoringPreview>> {
  return run(async () => {
    const source = await formatComponentSource(input.source);
    const prepared = prepareComponentDefinition({ ...input, source });
    const now = new Date(0);
    const definition: ComponentDefinition = {
      ...prepared,
      id: `preview:${prepared.tag}`,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    return {
      source,
      tag: definition.tag,
      name: definition.name,
      description: definition.description,
      schema: definition.schema,
      uiHints: definition.uiHints,
      defaultData: definition.defaultData,
      html: await renderComponentHtml(definition, definition.sampleData),
    };
  });
}

export async function diagnoseComponentSourceAction(
  source: string,
): Promise<ComponentActionResult<ComponentSourceDiagnostic[]>> {
  return run(() => diagnoseComponentSource(source));
}

export async function updateComponentAction(
  id: string,
  input: ComponentDefinitionInput,
): Promise<ComponentActionResult<ComponentMutationResult>> {
  return save(() => getComponentRepository().update(id, input));
}

export async function deleteComponentAction(
  id: string,
): Promise<ComponentActionResult<ComponentDefinition[]>> {
  return mutate(() => getComponentRepository().deleteAndMaterialize(id));
}

/** Supplies the visual instance editor without exposing locked shell HTML. */
export async function getComponentSpecAction(
  id: string,
): Promise<ComponentActionResult<ComponentSpec>> {
  return run(() => {
    const definition = getComponentRepository().get(id);
    if (!definition) throw new Error(`Component ${id} is not available.`);
    return toComponentSpec(definition);
  });
}

/** Expands one reference in the current unsaved draft after UI confirmation. */
export async function detachComponentDraftAction(
  source: string,
  index: number,
  expectedId: string,
): Promise<ComponentActionResult<string>> {
  return run(() => {
    const reference = parseArticleSource(source).references[index];
    if (!reference || reference.id !== expectedId) {
      throw new Error(
        "The selected Component changed. Open it again and retry.",
      );
    }
    return detachComponentReference(source, index, getComponentRepository());
  });
}

async function mutate(
  operation: () => unknown | Promise<unknown>,
): Promise<ComponentActionResult<ComponentDefinition[]>> {
  return run(async () => {
    await operation();
    revalidatePath("/components");
    return getComponentRepository().list();
  });
}

async function save(
  operation: () => ComponentDefinition | Promise<ComponentDefinition>,
): Promise<ComponentActionResult<ComponentMutationResult>> {
  return run(async () => {
    const saved = await operation();
    revalidatePath("/components");
    return {
      definitions: getComponentRepository().list(),
      saved,
    };
  });
}

async function run<T>(
  operation: () => T | Promise<T>,
): Promise<ComponentActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Component operation failed.",
    };
  }
}
