// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { Module } from '@usevibejs/server';
import { TodosController } from './todos.controller.ts';
import { TodosService } from './todos.service.ts';

@Module({ providers: [TodosService], controllers: [TodosController], exports: [TodosService] })
export class TodosModule {}
