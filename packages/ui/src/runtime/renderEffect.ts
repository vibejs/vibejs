import { ReactiveEffect } from '../reactivity/core.ts';
import { handleError } from './errorHandling.ts';
import { callHooks, currentInstance, currentParent, withInstance } from './instance.ts';
import { queueJob, queuePostFlushCb, SchedulerJobFlags, type SchedulerJob } from './scheduler.ts';

let order = 0;

/**
 * Runs `fn` now and again in the next flush after what it read changes. Codegen wraps each
 * dynamic binding in one render effect (an interpolation is one text node plus one effect), and
 * calls it while the block that owns it is built: the effect stops with the active effect scope.
 * Errors go to the error handler as `'render effect'`. `loc` is the dev-only source position,
 * `'src/A.vibe:12:5'`, that the dev logs of its errors and of VIBE5101 name.
 * The effect belongs to the current instance: it runs with that instance current, so content it
 * builds belongs to the instance too; its job id is `uid * 2 + 1`, so parents update before
 * children; and the first effect of a mounted instance to rerun in a flush calls its
 * `beforeUpdate` hooks and queues its `updated` hooks. Effects of equal job id run in creation
 * order, so an effect runs before the effects it creates.
 */
export function renderEffect(fn: () => void, loc?: string): void {
  const instance = currentInstance;
  const parent = currentParent;
  const effect = new ReactiveEffect(() =>
    withInstance(
      instance,
      () => {
        try {
          fn();
        } catch (err) {
          handleError(err, instance, 'render effect', loc);
        }
      },
      parent,
    ),
  );
  const job: SchedulerJob = () => {
    if (!effect.dirty) return;
    if (instance?.isMounted && !instance.updating) {
      instance.updating = true;
      callHooks(instance, 'beforeUpdate');
      queuePostFlushCb(() => {
        instance.updating = false;
        if (!instance.isUnmounted) callHooks(instance, 'updated');
      });
    }
    effect.run();
  };
  if (instance) job.id = instance.uid * 2 + 1;
  if (__DEV__) {
    job.instance = instance;
    job.loc = loc;
  }
  job.order = order++;
  job.flags = SchedulerJobFlags.ALLOW_RECURSE;
  effect.scheduler = () => queueJob(job);
  effect.onStop = () => {
    job.flags! |= SchedulerJobFlags.DISPOSED;
  };
  effect.run();
}
