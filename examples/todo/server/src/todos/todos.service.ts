import type * as v from 'valibot';
import type { Todo } from '../../../contracts/src/todos.contract.ts';

export type TodoItem = v.InferOutput<typeof Todo>;

export class TodosService {
  readonly #todos = new Map<string, TodoItem>();

  list(): TodoItem[] {
    return [...this.#todos.values()];
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

  remove(id: string): void {
    this.#todos.delete(id);
  }
}
