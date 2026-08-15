import "server-only";

import {
  detachComponentReference,
  parseArticleSource,
  serializeComponentSpec,
  serializeComponentSummaryIndex,
  toComponentSpec,
  type ComponentSpec,
} from "../../components";
import { getComponentRepository } from "../../components/server";

import {
  assertValidManagedArticleSource,
  compileManagedArticleSource,
  formatManagedArticleSource,
} from "../content";

export interface BuilderComponentModelContext {
  index: string;
  specs: readonly string[];
  loadedTypes: readonly string[];
}

export function builderComponentModelContext(
  source: string,
  requestText: string,
  requestedTypes: readonly string[] = [],
): BuilderComponentModelContext {
  const repository = getComponentRepository();
  const definitions = repository.list();
  const usedTypes = new Set(
    parseArticleSource(source).references.map((reference) => reference.type),
  );
  const relevantTypes = new Set(usedTypes);
  for (const candidate of likelyComponents(definitions, requestText)) {
    relevantTypes.add(candidate.type);
  }
  for (const type of requestedTypes) {
    if (!repository.get(type)) {
      throw new Error(`Component ${type} is not available.`);
    }
    relevantTypes.add(type);
  }

  const loadedTypes = [...relevantTypes].sort();
  const specs = loadedTypes
    .flatMap((type) => {
      const definition =
        repository.get(type) ??
        (usedTypes.has(type) ? repository.getForCompilation(type) : null);
      return definition ? [serializeComponentSpec(definition)] : [];
    });
  return {
    index: serializeComponentSummaryIndex(definitions),
    specs,
    loadedTypes,
  };
}

export async function prepareManagedSourceForSave(
  source: string,
  previousSource?: string,
): Promise<{ source: string; compiledHtml: string }> {
  const repository = getComponentRepository();
  const formatted = await formatManagedArticleSource(source, repository);
  assertValidManagedArticleSource(formatted, repository, {
    allowBlank: true,
    previousSource,
  });
  return {
    source: formatted,
    compiledHtml: await compileManagedArticleSource(formatted, repository),
  };
}

export async function prepareHistoricalSourceForRestore(
  historicalSource: string,
): Promise<{ source: string; compiledHtml: string }> {
  const repository = getComponentRepository();
  let source = historicalSource;
  const references = parseArticleSource(source).references;
  for (let index = references.length - 1; index >= 0; index -= 1) {
    const reference = references[index]!;
    if (repository.get(reference.type)) continue;
    if (!repository.getForCompilation(reference.type)) {
      throw new Error(`Historical Component ${reference.type} is unavailable.`);
    }
    source = detachComponentReference(source, { start: reference.start }, repository);
  }
  return prepareManagedSourceForSave(source);
}

export function assertManagedModelOutput(
  previousSource: string,
  nextSource: string,
): void {
  assertValidManagedArticleSource(nextSource, getComponentRepository(), {
    previousSource,
  });
}

export function detachManagedComponentDraft(
  source: string,
  index: number,
  expectedType: string,
): string {
  const repository = getComponentRepository();
  const reference = parseArticleSource(source).references[index];
  if (!reference || reference.type !== expectedType) {
    throw new Error("The selected managed Component changed. Reload and retry.");
  }
  return detachComponentReference(source, index, repository);
}

export function getBuilderComponentSpec(type: string): ComponentSpec | null {
  const definition = getComponentRepository().get(type);
  return definition ? toComponentSpec(definition) : null;
}

export async function compileBuilderPreviewSource(source: string): Promise<string> {
  return compileManagedArticleSource(source, getComponentRepository(), {
    allowDeleted: true,
  });
}

export async function formatBuilderSourceDraft(source: string): Promise<string> {
  const repository = getComponentRepository();
  const formatted = await formatManagedArticleSource(source, repository);
  assertValidManagedArticleSource(formatted, repository, { allowBlank: true });
  return formatted;
}

export function hasActiveComponents(): boolean {
  return getComponentRepository().listSummaries().length > 0;
}

function likelyComponents<T extends { type: string; description: string }>(
  definitions: readonly T[],
  requestText: string,
): T[] {
  const terms = new Set(
    requestText
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length > 2) ?? [],
  );
  if (terms.size === 0) return [];
  return definitions
    .map((definition) => {
      const searchable = `${definition.type} ${definition.description}`
        .toLowerCase()
        .match(/[a-z0-9]+/g) ?? [];
      return {
        definition,
        score: searchable.filter((term) => terms.has(term)).length,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.definition.type.localeCompare(right.definition.type),
    )
    .slice(0, 3)
    .map((candidate) => candidate.definition);
}
