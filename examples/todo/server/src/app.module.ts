// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { Module, type AppOptions } from '@vibejs-org/server';
import { TodosModule } from './todos/todos.module.ts';

@Module({ imports: [TodosModule] })
export class AppModule {}

export const appOptions: AppOptions = { basePath: '/api' };
