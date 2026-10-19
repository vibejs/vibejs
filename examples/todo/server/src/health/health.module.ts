// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { Module } from '@vibejs-org/server';
import { HealthController } from './health.controller.ts';

@Module({ controllers: [HealthController] })
export class HealthModule {}
