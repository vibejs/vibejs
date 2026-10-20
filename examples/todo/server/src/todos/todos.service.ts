import type * as v from 'valibot';
import type { Todo } from '../../../contracts/src/todos.contract.ts';

export type TodoItem = v.InferOutput<typeof Todo>;

export class TodosService {
  readonly #todos = new Map<string, TodoItem>();

  list(): TodoItem[] {
    return [...this.#todos.values()];
  }

  get(id: string): TodoItem | undefined {
    return this.#todos.get(id);
  }

  create(title: string): TodoItem {
    const todo = { id: crypto.randomUUID(), title, done: false };
    this.#todos.set(todo.id, todo);
    return todo;
  }

  toggle(id: string): TodoItem | undefined {
    const todo = this.#todos.get(id);
    if (todo) todo.done = !todo.done;
    return todo;
  }

  /** Removes the todo; `false` when there is none with `id`. */
  remove(id: string): boolean {
    return this.#todos.delete(id);
  }
}
