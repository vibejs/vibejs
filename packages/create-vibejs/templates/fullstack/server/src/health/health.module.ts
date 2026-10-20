import { Module } from '@vibejs-org/server';
import { HealthController } from './health.controller.ts';

@Module({ controllers: [HealthController] })
export class HealthModule {}
