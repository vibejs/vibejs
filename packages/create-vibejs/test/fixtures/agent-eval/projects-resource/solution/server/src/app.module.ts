import { Module, type AppOptions } from '@usevibejs/server';
import { HealthModule } from './health/health.module.ts';
import { ProjectsModule } from './projects/projects.module.ts';

@Module({ imports: [HealthModule, ProjectsModule] })
export class AppModule {}

export const appOptions: AppOptions = { basePath: '/api' };
