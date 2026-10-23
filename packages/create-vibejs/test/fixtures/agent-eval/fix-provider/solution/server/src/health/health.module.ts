import { Module } from '@usevibejs/server';
import { HealthController } from './health.controller.ts';
import { HealthService } from './health.service.ts';

@Module({ providers: [HealthService], controllers: [HealthController] })
export class HealthModule {}
