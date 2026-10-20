import { Controller, Handle, inject } from '@vibejs-org/server';
import { health } from '../../../contracts/src/health.contract.ts';
import { HealthService } from './health.service.ts';

@Controller(health)
export class HealthController {
  private readonly health = inject(HealthService);

  @Handle(health.get)
  get(): { status: 'ok' } {
    return { status: this.health.status() };
  }
}
