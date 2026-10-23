import { Controller, Handle, type Ctx } from '@usevibejs/server';
import { health } from '../../../contracts/src/health.contract.ts';

const SERVICES = ['api', 'db'];

@Controller(health)
export class HealthController {
  @Handle(health.get)
  get(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Handle(health.service)
  service(ctx: Ctx<typeof health.service>): { service: string; status: 'ok' } {
    const { service } = ctx.params;
    if (!SERVICES.includes(service)) ctx.fail('UNKNOWN_SERVICE', `No service ${service}`);
    return { service, status: 'ok' };
  }
}
