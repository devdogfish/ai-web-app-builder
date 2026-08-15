import "server-only";

import {
  detachComponentReference,
  displayComponentTagReferences,
  parseArticleSource,
  resolveComponentTagReferences,
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
  loadedTags: readonly string[];
}

export function builderComponentModelContext(
  source: string,
  requestText: string,
  requestedTags: readonly string[] = [],
): BuilderComponentModelContext {
  const repository = getComponentRepository();
  const definitions = repository.list();
  const usedIds = new Set(
    parseArticleSource(source).references.map((reference) => reference.id),
  );
  const relevantIds = new Set(usedIds);
  for (const candidate of likelyComponents(definitions, requestText)) {
    relevantIds.add(candidate.id);
  }
  for (const tag of requestedTags) {
    const definition = repository.getByTag(tag);
    if (!definition) {
      throw new Error(`Component ${tag} is not available.`);
    }
    relevantIds.add(definition.id);
  }

  const loadedDefinitions = [...relevantIds].flatMap((id) => {
    const definition =
      repository.get(id) ??
      (usedIds.has(id) ? repository.getForCompilation(id) : null);
    return definition ? [definition] : [];
  });
  return {
    index: serializeComponentSummaryIndex(definitions),
    specs: loadedDefinitions.map(serializeComponentSpec),
    loadedTags: loadedDefinitions.map((definition) => definition.tag).sort(),
  };
}

export async function prepareManagedSourceForSave(
  source: string,
  options: {
    availableImageSources: ReadonlySet<string>;
    previousSource?: string;
  },
): Promise<{ source: string; compiledHtml: string }> {
  const repository = getComponentRepository();
  const resolved = resolveComponentTagReferences(source, (tag) =>
    repository.getByTag(tag),
  );
  const formatted = await formatManagedArticleSource(resolved, repository);
  await assertValidManagedArticleSource(formatted, repository, {
    allowBlank: true,
    availableImageSources: options.availableImageSources,
    previousSource: options.previousSource,
  });
  return {
    source: formatted,
    compiledHtml: await compileManagedArticleSource(formatted, repository),
  };
}

export async function prepareHistoricalSourceForRestore(
  historicalSource: string,
  availableImageSources: ReadonlySet<string>,
): Promise<{ source: string; compiledHtml: string }> {
  const repository = getComponentRepository();
  let source = historicalSource;
  const references = parseArticleSource(source).references;
  for (let index = references.length - 1; index >= 0; index -= 1) {
    const reference = references[index]!;
    if (repository.get(reference.id)) continue;
    if (!repository.getForCompilation(reference.id)) {
      throw new Error(`Historical Component ${reference.id} is unavailable.`);
    }
    source = await detachComponentReference(
      source,
      { start: reference.start },
      repository,
    );
  }
  return prepareManagedSourceForSave(source, { availableImageSources });
}

export async function assertManagedModelOutput(
  previousSource: string,
  nextSource: string,
): Promise<void> {
  const repository = getComponentRepository();
  const resolved = resolveComponentTagReferences(nextSource, (tag) =>
    repository.getByTag(tag),
  );
  await assertValidManagedArticleSource(resolved, repository, {
    previousSource,
  });
}

export async function detachManagedComponentDraft(
  source: string,
  index: number,
  expectedId: string,
): Promise<string> {
  const repository = getComponentRepository();
  const reference = parseArticleSource(source).references[index];
  if (!reference || reference.id !== expectedId) {
    throw new Error(
      "The selected managed Component changed. Reload and retry.",
    );
  }
  return detachComponentReference(source, index, repository);
}

export function getBuilderComponentSpec(id: string): ComponentSpec | null {
  const definition = getComponentRepository().get(id);
  return definition ? toComponentSpec(definition) : null;
}

export async function compileBuilderPreviewSource(
  source: string,
): Promise<string> {
  return compileManagedArticleSource(source, getComponentRepository(), {
    allowDeleted: true,
  });
}

export async function formatBuilderSourceDraft(
  source: string,
): Promise<string> {
  const repository = getComponentRepository();
  const resolved = resolveComponentTagReferences(source, (tag) =>
    repository.getByTag(tag),
  );
  const formatted = await formatManagedArticleSource(resolved, repository);
  await assertValidManagedArticleSource(formatted, repository, {
    allowBlank: true,
  });
  return formatted;
}

export function hasActiveComponents(): boolean {
  return getComponentRepository().listSummaries().length > 0;
}

export function displayManagedSourceForModel(source: string): string {
  const repository = getComponentRepository();
  return displayComponentTagReferences(source, (id) =>
    repository.getForCompilation(id),
  );
}

function likelyComponents<
  T extends { id: string; tag: string; name: string; description: string },
>(definitions: readonly T[], requestText: string): T[] {
  const terms = new Set(
    requestText
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length > 2) ?? [],
  );
  if (terms.size === 0) return [];
  return definitions
    .map((definition) => {
      const searchable =
        `${definition.name} ${definition.description}`
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
        left.definition.name.localeCompare(right.definition.name),
    )
    .slice(0, 3)
    .map((candidate) => candidate.definition);
}
