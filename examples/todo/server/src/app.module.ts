// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { Module, type AppOptions } from '@vibejs-org/server';
import { FlagsModule } from 'todo-flags/server';
import { HealthModule } from './health/health.module.ts';
import { TodosModule } from './todos/todos.module.ts';

@Module({
  imports: [TodosModule, HealthModule, FlagsModule.forRoot({ flags: { removeDone: true } })],
})
export class AppModule {}

export const appOptions: AppOptions = { basePath: '/api' };
