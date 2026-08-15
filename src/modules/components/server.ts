import "server-only";

import {
  createComponentRepository,
  type ComponentRepository,
} from "./repository";

const REPOSITORY_IMPLEMENTATION_VERSION = 3;

const componentGlobal = globalThis as typeof globalThis & {
  componentRepository?: ComponentRepository;
  componentRepositoryImplementation?: number;
};

export function getComponentRepository(): ComponentRepository {
  if (
    !componentGlobal.componentRepository ||
    componentGlobal.componentRepositoryImplementation !==
      REPOSITORY_IMPLEMENTATION_VERSION
  ) {
    componentGlobal.componentRepository?.close();
    componentGlobal.componentRepository = createComponentRepository();
    componentGlobal.componentRepositoryImplementation =
      REPOSITORY_IMPLEMENTATION_VERSION;
  }
  return componentGlobal.componentRepository;
}
