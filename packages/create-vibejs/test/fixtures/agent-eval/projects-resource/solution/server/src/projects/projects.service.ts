import type { CreateProject, Project } from '../../../contracts/src/projects.contract.ts';

export class ProjectsService {
  readonly #items = new Map<string, Project>();

  list(): Project[] {
    return [...this.#items.values()];
  }

  create(input: CreateProject): Project {
    const item = { ...input, id: crypto.randomUUID() };
    this.#items.set(item.id, item);
    return item;
  }
}
