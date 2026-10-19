import { Controller, Handle, Module, type AppOptions } from '@vibejs-org/server';
import { health } from '../../contracts/src/health.contract.ts';

@Controller(health)
class HealthController {
  @Handle(health.get)
  get(): string {
    return 'ok';
  }
}

@Module({ controllers: [HealthController] })
export class AppModule {}

export const appOptions: AppOptions = { basePath: '/api' };
