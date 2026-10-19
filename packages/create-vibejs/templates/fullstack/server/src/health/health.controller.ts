import { Controller, Handle } from '@vibejs-org/server';
import { health } from '../../../contracts/src/health.contract.ts';

@Controller(health)
export class HealthController {
  @Handle(health.get)
  get(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
