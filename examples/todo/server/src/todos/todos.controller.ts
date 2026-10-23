import { Controller, Handle, inject, type Ctx } from '@usevibejs/server';
import { todos } from '../../../contracts/src/todos.contract.ts';
import { TodosService, type TodoItem } from './todos.service.ts';

@Controller(todos)
export class TodosController {
  private readonly todos = inject(TodosService);

  @Handle(todos.list)
  list(): TodoItem[] {
    return this.todos.list();
  }

  @Handle(todos.get)
  get(ctx: Ctx<typeof todos.get>): TodoItem {
    return this.todos.get(ctx.params.id) ?? ctx.fail('TODO_NOT_FOUND', `No todo ${ctx.params.id}`);
  }

  @Handle(todos.create)
  create(ctx: Ctx<typeof todos.create>): TodoItem {
    return this.todos.create(ctx.body.title);
  }

  @Handle(todos.toggle)
  toggle(ctx: Ctx<typeof todos.toggle>): TodoItem {
    return (
      this.todos.toggle(ctx.params.id) ?? ctx.fail('TODO_NOT_FOUND', `No todo ${ctx.params.id}`)
    );
  }

  @Handle(todos.remove)
  remove(ctx: Ctx<typeof todos.remove>): void {
    if (!this.todos.remove(ctx.params.id)) ctx.fail('TODO_NOT_FOUND', `No todo ${ctx.params.id}`);
  }
}
