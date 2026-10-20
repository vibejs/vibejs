// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import {
  Controller,
  Handle,
  inject,
  Module,
  token,
  type DynamicModule,
  type Token,
} from '@vibejs-org/server';
import { flags } from '../contract/flags.contract.ts';

export interface FlagsOptions {
  flags: Record<string, boolean>;
}

export const FLAGS_OPTIONS: Token<FlagsOptions> = token<FlagsOptions>('FLAGS_OPTIONS');

@Controller(flags)
class FlagsController {
  private readonly options = inject(FLAGS_OPTIONS);

  @Handle(flags.list)
  list(): Record<string, boolean> {
    return this.options.flags;
  }
}

/** Serves `GET /flags`; import `FlagsModule.forRoot({ flags })`. */
@Module({})
export class FlagsModule {
  static forRoot(options: FlagsOptions): DynamicModule {
    return {
      module: FlagsModule,
      controllers: [FlagsController],
      providers: [{ provide: FLAGS_OPTIONS, useValue: options }],
    };
  }
}
