// Smoke test: Oxc lowers legacy decorators because this package's tsconfig.json sets
// experimentalDecorators. No Babel or SWC plugin is involved.
import { expect, it } from 'vitest';

const calls: string[] = [];

function Tagged(tag: string) {
  return (target: abstract new (...args: never[]) => unknown): void => {
    calls.push(`class ${target.name} ${tag}`);
  };
}

// Legacy signature: (prototype, key, descriptor). A TC39 decorator would get (value, context).
function Replaced(target: object, key: string, descriptor: PropertyDescriptor): void {
  calls.push(`method ${target.constructor.name}.${key}`);
  descriptor.value = () => 'decorated';
}

@Tagged('svc')
class Service {
  @Replaced
  greet(): string {
    return 'plain';
  }
}

it('applies a legacy class decorator and a legacy method decorator', () => {
  expect(calls).toEqual(['method Service.greet', 'class Service svc']);
  expect(new Service().greet()).toBe('decorated');
});
