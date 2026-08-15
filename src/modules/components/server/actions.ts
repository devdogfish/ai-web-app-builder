"use server";

import { revalidatePath } from "next/cache";

import {
  assertBuilderActionAccess,
  type BuilderOperation,
} from "@/modules/builder/environment/request-resolver";

import {
  detachComponentReference,
  parseArticleSource,
  toComponentSpec,
  type ComponentDefinition,
  type ComponentDefinitionInput,
  type ComponentSpec,
} from "@/modules/components";
import { getComponentRepository } from "@/modules/components/server";

export type ComponentActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

export async function listComponentDefinitionsAction(): Promise<
  ComponentActionResult<ComponentDefinition[]>
> {
  return run(() => getComponentRepository().list());
}

export async function createComponentAction(
  input: ComponentDefinitionInput,
): Promise<ComponentActionResult<ComponentDefinition[]>> {
  return mutate(() => getComponentRepository().create(input));
}

export async function updateComponentAction(
  type: string,
  input: ComponentDefinitionInput,
): Promise<ComponentActionResult<ComponentDefinition[]>> {
  return mutate(() => getComponentRepository().update(type, input));
}

export async function deleteComponentAction(
  type: string,
): Promise<ComponentActionResult<ComponentDefinition[]>> {
  return mutate(() => getComponentRepository().deleteAndMaterialize(type));
}

/** Supplies the visual instance editor without exposing locked shell HTML. */
export async function getComponentSpecAction(
  type: string,
): Promise<ComponentActionResult<ComponentSpec>> {
  return run(() => {
    const definition = getComponentRepository().get(type);
    if (!definition) throw new Error(`Component ${type} is not available.`);
    return toComponentSpec(definition);
  });
}

/** Expands one reference in the current unsaved draft after UI confirmation. */
export async function detachComponentDraftAction(
  source: string,
  index: number,
  expectedType: string,
): Promise<ComponentActionResult<string>> {
  return run(() => {
    const reference = parseArticleSource(source).references[index];
    if (!reference || reference.type !== expectedType) {
      throw new Error(
        "The selected Component changed. Open it again and retry.",
      );
    }
    return detachComponentReference(source, index, getComponentRepository());
  });
}

async function mutate(
  operation: () => unknown,
): Promise<ComponentActionResult<ComponentDefinition[]>> {
  return run(async () => {
    operation();
    revalidatePath("/components");
    return getComponentRepository().list();
  }, "mutate");
}

async function run<T>(
  operation: () => T | Promise<T>,
  access: BuilderOperation = "read",
): Promise<ComponentActionResult<T>> {
  try {
    await assertBuilderActionAccess(access);
    return { ok: true, data: await operation() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Component operation failed.",
    };
  }
}
