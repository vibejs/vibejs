import { Module, type AppOptions } from '@vibejs-org/server';
import { HealthModule } from './health/health.module.ts';

@Module({ imports: [HealthModule] })
export class AppModule {}

export const appOptions: AppOptions = { basePath: '/api' };
