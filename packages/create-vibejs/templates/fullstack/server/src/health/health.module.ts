import { Module } from '@usevibejs/server';
import { HealthController } from './health.controller.ts';

@Module({ controllers: [HealthController] })
export class HealthModule {}
