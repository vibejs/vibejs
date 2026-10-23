import { Module } from '@usevibejs/server';
import { ProjectsController } from './projects.controller.ts';
import { ProjectsService } from './projects.service.ts';

@Module({ providers: [ProjectsService], controllers: [ProjectsController] })
export class ProjectsModule {}
