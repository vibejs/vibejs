// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/scheduler.spec.ts (MIT)
//
// Left out: the cases built on the PRE flag and `flushPreFlushCbs()`, which this scheduler does not
// have (a pre watcher is a job with id -1, an owned one `uid * 2`, a render effect `uid * 2 + 1`):
// "queueJob & preFlushCb inside preFlushCb", "should insert jobs after pre jobs with the same id",
// "preFlushCb inside queueJob", "sort job based on id", "jobs are de-duplicated correctly when
// calling flushPreFlushCbs", "flushPreFlushCbs inside a pre job" and "flushPreFlushCbs inside a post
// job". The cases built on the synchronous post-queue flush and `flushOnAppMount()` of app mounting
// move to RR-5: "should not overflow the call stack when merging a very large cb array into an
// active flush", "flushPostFlushCbs", "flushOnAppMount recovers from a throwing pre job" and "nested
// flushPostFlushCbs". An error no longer stops the flush: the two error cases assert that the
// remaining jobs run and that the error is reported as VIBE5102.
import { isVibeError } from '@usevibejs/errors';
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import {
  nextTick,
  queueJob,
  queuePostFlushCb,
  ALLOW_RECURSE,
  DISPOSED,
  type SchedulerJob,
} from './scheduler.ts';

const job = (fn: () => void, id?: number, flags?: number): SchedulerJob =>
  Object.assign(fn, { id, flags });

/** The errors that reached `handleError`: each is logged once as the cause of a VIBE5102. */
function spyErrors(): { reported: () => { info: unknown; cause: unknown }[] } {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return {
    reported: () =>
      spy.mock.calls.map(([logged]) => {
        if (!isVibeError(logged, 'VIBE5102')) throw new TypeError('expected a VIBE5102');
        const error = logged;
        return { info: error.args.info, cause: error.cause };
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scheduler', () => {
  it('nextTick', async () => {
    const calls: string[] = [];
    const dummyThen = Promise.resolve().then();
    const job1 = () => {
      calls.push('job1');
    };
    const job2 = () => {
      calls.push('job2');
    };
    void nextTick(job1);
    job2();

    expect(calls.length).toBe(1);
    await dummyThen;
    // job1 will be pushed in nextTick
    expect(calls.length).toBe(2);
    expect(calls).toMatchObject(['job2', 'job1']);
  });

  describe('queueJob', () => {
    it('basic usage', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
      };
      const job2 = () => {
        calls.push('job2');
      };
      queueJob(job1);
      queueJob(job2);
      expect(calls).toEqual([]);
      await nextTick();
      expect(calls).toEqual(['job1', 'job2']);
    });

    it("should insert jobs in ascending order of job's id when flushing", async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');

        queueJob(job2);
        queueJob(job3);
      };

      const job2 = job(() => {
        calls.push('job2');
        queueJob(job4);
        queueJob(job5);
      }, 10);

      const job3 = job(() => {
        calls.push('job3');
      }, 1);

      const job4 = () => {
        calls.push('job4');
      };

      const job5 = () => {
        calls.push('job5');
      };

      queueJob(job1);

      expect(calls).toEqual([]);
      await nextTick();
      expect(calls).toEqual(['job1', 'job3', 'job2', 'job4', 'job5']);
    });

    it('should dedupe queued jobs', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
      };
      const job2 = () => {
        calls.push('job2');
      };
      queueJob(job1);
      queueJob(job2);
      queueJob(job1);
      queueJob(job2);
      expect(calls).toEqual([]);
      await nextTick();
      expect(calls).toEqual(['job1', 'job2']);
    });

    it('queueJob while flushing', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
        // job2 will be executed after job1 at the same tick
        queueJob(job2);
      };
      const job2 = () => {
        calls.push('job2');
      };
      queueJob(job1);

      await nextTick();
      expect(calls).toEqual(['job1', 'job2']);
    });
  });

  // Upstream flags these jobs PRE; here a pre job is one with id -1.
  describe('pre flush jobs', () => {
    it('queueJob inside preFlushCb', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
      };
      const cb1 = job(() => {
        // queueJob in postFlushCb
        calls.push('cb1');
        queueJob(job1);
      }, -1);

      queueJob(cb1);
      await nextTick();
      expect(calls).toEqual(['cb1', 'job1']);
    });

    it('should insert pre jobs without ids first during flushing', async () => {
      const calls: string[] = [];
      const job1 = job(() => {
        calls.push('job1');
        queueJob(job3);
        queueJob(job4);
      }, -1);
      const job2 = job(() => {
        calls.push('job2');
      }, 1);
      const job3 = job(() => {
        calls.push('job3');
      }, -1);
      const job4 = job(() => {
        calls.push('job4');
      }, -1);

      queueJob(job1);
      queueJob(job2);
      await nextTick();
      expect(calls).toEqual(['job1', 'job3', 'job4', 'job2']);
    });

    // #3806
    it('queue preFlushCb inside postFlushCb', async () => {
      const spy = vi.fn<() => void>();
      const cb = job(() => spy(), -1);
      queuePostFlushCb(() => {
        queueJob(cb);
      });
      await nextTick();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('queuePostFlushCb', () => {
    it('basic usage', async () => {
      const calls: string[] = [];
      const cb1 = () => {
        calls.push('cb1');
      };
      const cb2 = () => {
        calls.push('cb2');
      };
      const cb3 = () => {
        calls.push('cb3');
      };

      queuePostFlushCb([cb1, cb2]);
      queuePostFlushCb(cb3);

      expect(calls).toEqual([]);
      await nextTick();
      expect(calls).toEqual(['cb1', 'cb2', 'cb3']);
    });

    it('should not overflow the call stack with a very large cb array', async () => {
      // a suspense boundary can buffer an unbounded number of post effects
      // while pending (e.g. a large tree re-rendering under it) and flush them
      // all at once on resolve - spreading such an array into push() throws
      // RangeError: Maximum call stack size exceeded
      let called = 0;
      const cbs: SchedulerJob[] = [];
      for (let i = 0; i < 1000000; i++) {
        cbs.push(() => {
          called++;
        });
      }

      queuePostFlushCb(cbs);
      await nextTick();
      expect(called).toBe(1000000);
    });

    it('should dedupe queued postFlushCb', async () => {
      const calls: string[] = [];
      const cb1 = () => {
        calls.push('cb1');
      };
      const cb2 = () => {
        calls.push('cb2');
      };
      const cb3 = () => {
        calls.push('cb3');
      };

      queuePostFlushCb([cb1, cb2]);
      queuePostFlushCb(cb3);

      queuePostFlushCb([cb1, cb3]);
      queuePostFlushCb(cb2);

      expect(calls).toEqual([]);
      await nextTick();
      expect(calls).toEqual(['cb1', 'cb2', 'cb3']);
    });

    it('queuePostFlushCb while flushing', async () => {
      const calls: string[] = [];
      const cb1 = () => {
        calls.push('cb1');
        // cb2 will be executed after cb1 at the same tick
        queuePostFlushCb(cb2);
      };
      const cb2 = () => {
        calls.push('cb2');
      };
      queuePostFlushCb(cb1);

      await nextTick();
      expect(calls).toEqual(['cb1', 'cb2']);
    });
  });

  describe('queueJob w/ queuePostFlushCb', () => {
    it('queueJob inside postFlushCb', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
      };
      const cb1 = () => {
        // queueJob in postFlushCb
        calls.push('cb1');
        queueJob(job1);
      };

      queuePostFlushCb(cb1);
      await nextTick();
      expect(calls).toEqual(['cb1', 'job1']);
    });

    it('queueJob & postFlushCb inside postFlushCb', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
      };
      const cb1 = () => {
        calls.push('cb1');
        queuePostFlushCb(cb2);
        // job1 will executed before cb2
        // Job has higher priority than postFlushCb
        queueJob(job1);
      };
      const cb2 = () => {
        calls.push('cb2');
      };

      queuePostFlushCb(cb1);
      await nextTick();
      expect(calls).toEqual(['cb1', 'job1', 'cb2']);
    });

    it('postFlushCb inside queueJob', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
        // postFlushCb in queueJob
        queuePostFlushCb(cb1);
      };
      const cb1 = () => {
        calls.push('cb1');
      };

      queueJob(job1);
      await nextTick();
      expect(calls).toEqual(['job1', 'cb1']);
    });

    it('queueJob & postFlushCb inside queueJob', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');
        // cb1 will executed after job2
        // Job has higher priority than postFlushCb
        queuePostFlushCb(cb1);
        queueJob(job2);
      };
      const job2 = () => {
        calls.push('job2');
      };
      const cb1 = () => {
        calls.push('cb1');
      };

      queueJob(job1);
      await nextTick();
      expect(calls).toEqual(['job1', 'job2', 'cb1']);
    });

    it('nested queueJob w/ postFlushCb', async () => {
      const calls: string[] = [];
      const job1 = () => {
        calls.push('job1');

        queuePostFlushCb(cb1);
        queueJob(job2);
      };
      const job2 = () => {
        calls.push('job2');
        queuePostFlushCb(cb2);
      };
      const cb1 = () => {
        calls.push('cb1');
      };
      const cb2 = () => {
        calls.push('cb2');
      };

      queueJob(job1);
      await nextTick();
      expect(calls).toEqual(['job1', 'job2', 'cb1', 'cb2']);
    });

    test('jobs added during post flush are ordered correctly', async () => {
      const calls: string[] = [];

      const job1 = job(() => {
        calls.push('job1');
      }, 1);

      const job2 = job(() => {
        calls.push('job2');
      }, 2);

      queuePostFlushCb(() => {
        queueJob(job2);
        queueJob(job1);
      });

      await nextTick();

      expect(calls).toEqual(['job1', 'job2']);
    });
  });

  test('sort SchedulerCbs based on id', async () => {
    const calls: string[] = [];
    const cb1 = () => calls.push('cb1');
    // cb1 has no id
    const cb2 = job(() => calls.push('cb2'), 2);
    const cb3 = job(() => calls.push('cb3'), 1);

    queuePostFlushCb(cb1);
    queuePostFlushCb(cb2);
    queuePostFlushCb(cb3);
    await nextTick();
    expect(calls).toEqual(['cb3', 'cb2', 'cb1']);
  });

  // #1595
  test('avoid duplicate postFlushCb invocation', async () => {
    const calls: string[] = [];
    const cb1 = () => {
      calls.push('cb1');
      queuePostFlushCb(cb2);
    };
    const cb2 = () => {
      calls.push('cb2');
    };
    queuePostFlushCb(cb1);
    queuePostFlushCb(cb2);
    await nextTick();
    expect(calls).toEqual(['cb1', 'cb2']);
  });

  test('nextTick should capture scheduler flush errors', async () => {
    const { reported } = spyErrors();
    const err = new Error('test');
    queueJob(() => {
      throw err;
    });
    await expect(nextTick()).resolves.toBeUndefined();
    expect(reported()).toEqual([{ info: 'scheduler flush', cause: err }]);

    // this one should no longer error
    await nextTick();
    expect(reported()).toHaveLength(1);
  });

  test('jobs can be re-queued after an error', async () => {
    const { reported } = spyErrors();
    const err = new Error('test');
    let shouldThrow = true;

    const job1 = job(
      vi.fn<() => void>(() => {
        if (shouldThrow) {
          shouldThrow = false;
          throw err;
        }
      }),
      1,
    );
    const job2 = job(vi.fn<() => void>(), 2);

    queueJob(job1);
    queueJob(job2);

    await nextTick();
    expect(reported()).toEqual([{ info: 'scheduler flush', cause: err }]);

    // The flush goes on after an error.
    expect(job1).toHaveBeenCalledTimes(1);
    expect(job2).toHaveBeenCalledTimes(1);

    queueJob(job1);
    queueJob(job2);

    await nextTick();

    expect(job1).toHaveBeenCalledTimes(2);
    expect(job2).toHaveBeenCalledTimes(2);
  });

  test('should prevent self-triggering jobs by default', async () => {
    let count = 0;
    const self = () => {
      if (count < 3) {
        count++;
        queueJob(self);
      }
    };
    queueJob(self);
    await nextTick();
    // only runs once - a job cannot queue itself
    expect(count).toBe(1);
  });

  test('should allow explicitly marked jobs to trigger itself', async () => {
    // normal job
    let count = 0;
    const recursive: SchedulerJob = job(
      () => {
        if (count < 3) {
          count++;
          queueJob(recursive);
        }
      },
      undefined,
      ALLOW_RECURSE,
    );
    queueJob(recursive);
    await nextTick();
    expect(count).toBe(3);

    // post cb
    const cb: SchedulerJob = job(
      () => {
        if (count < 5) {
          count++;
          queuePostFlushCb(cb);
        }
      },
      undefined,
      ALLOW_RECURSE,
    );
    queuePostFlushCb(cb);
    await nextTick();
    expect(count).toBe(5);
  });

  test('recursive jobs can only be queued once non-recursively', async () => {
    const recursive = job(vi.fn<() => void>(), 1, ALLOW_RECURSE);

    queueJob(recursive);
    queueJob(recursive);

    await nextTick();

    expect(recursive).toHaveBeenCalledTimes(1);
  });

  test('recursive jobs can only be queued once recursively', async () => {
    let recurse = true;

    const recursive: SchedulerJob = job(
      vi.fn<() => void>(() => {
        if (recurse) {
          queueJob(recursive);
          queueJob(recursive);
          recurse = false;
        }
      }),
      1,
      ALLOW_RECURSE,
    );

    queueJob(recursive);

    await nextTick();

    expect(recursive).toHaveBeenCalledTimes(2);
  });

  test(`recursive jobs can't be re-queued by other jobs`, async () => {
    let recurse = true;

    const job1 = job(() => {
      if (recurse) {
        // job2 is already queued, so this shouldn't do anything
        queueJob(job2);
        recurse = false;
      }
    }, 1);

    const job2: SchedulerJob = job(
      vi.fn<() => void>(() => {
        if (recurse) {
          queueJob(job1);
          queueJob(job2);
        }
      }),
      2,
      ALLOW_RECURSE,
    );

    queueJob(job2);

    await nextTick();

    expect(job2).toHaveBeenCalledTimes(2);
  });

  // #910
  test('should not run stopped reactive effects', async () => {
    const spy = vi.fn<() => void>();

    // simulate parent component that toggles child
    const job1 = () => {
      job2.flags = (job2.flags ?? 0) | DISPOSED;
    };
    // simulate child that's triggered by the same reactive change that
    // triggers its toggle
    const job2: SchedulerJob = () => spy();
    expect(spy).toHaveBeenCalledTimes(0);

    queueJob(job1);
    queueJob(job2);
    await nextTick();

    // should not be called
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('nextTick should return promise', async () => {
    const fn = vi.fn<() => number>(() => {
      return 1;
    });

    const p = nextTick(fn);

    expect(p).toBeInstanceOf(Promise);
    expect(await p).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('job order', () => {
  test('pre watchers, owned pre watchers, render effects, then jobs without an id', async () => {
    const calls: string[] = [];
    const push = (name: string, id?: number) => job(() => calls.push(name), id);
    // Two components: uid 1 (parent) and uid 2 (child).
    const jobs = [
      push('render 2', 5),
      push('none'),
      push('pre owned 2', 4),
      push('render 1', 3),
      push('pre owned 1', 2),
      push('pre', -1),
    ];
    for (const queued of jobs) queueJob(queued);
    await nextTick();
    expect(calls).toEqual(['pre', 'pre owned 1', 'render 1', 'pre owned 2', 'render 2', 'none']);
  });

  test('equal ids keep their insertion order, before and during the flush', async () => {
    const calls: string[] = [];
    const late = job(() => calls.push('late -1'), -1);
    const jobs = [
      job(() => calls.push('a 3'), 3),
      job(() => {
        calls.push('first -1');
        queueJob(late);
      }, -1),
      job(() => calls.push('second -1'), -1),
      job(() => calls.push('b 3'), 3),
    ];
    for (const queued of jobs) queueJob(queued);
    await nextTick();
    expect(calls).toEqual(['first -1', 'second -1', 'late -1', 'a 3', 'b 3']);
  });

  test('equal ids run in creation order, then jobs without one', async () => {
    const calls: string[] = [];
    const ordered = (name: string, order: number) =>
      Object.assign(() => calls.push(name), { order });
    for (const queued of [ordered('c', 2), job(() => calls.push('none')), ordered('a', 0)]) {
      queueJob(queued);
    }
    queueJob(ordered('b', 1));
    await nextTick();
    expect(calls).toEqual(['a', 'b', 'c', 'none']);
  });

  test('a job queued during the flush lands at its sorted position', async () => {
    const calls: string[] = [];
    const inserted = job(() => calls.push('2'), 2);
    const jobs = [
      job(() => {
        calls.push('1');
        queueJob(inserted);
      }, 1),
      job(() => calls.push('3'), 3),
    ];
    for (const queued of jobs) queueJob(queued);
    await nextTick();
    expect(calls).toEqual(['1', '2', '3']);
  });

  test('post callbacks run after the main queue, sorted and deduped, until both are empty', async () => {
    const calls: string[] = [];
    const again = job(() => calls.push('job again'), 1);
    const cb2 = job(() => {
      calls.push('post 2');
      queueJob(again);
    }, 2);
    const cb1 = job(() => calls.push('post 1'), 1);
    queuePostFlushCb(cb2);
    queuePostFlushCb([cb1, cb2]);
    queueJob(() => calls.push('job'));
    await nextTick();
    expect(calls).toEqual(['job', 'post 1', 'post 2', 'job again']);
  });
});

describe('nextTick', () => {
  test('resolves after the post callbacks of the current flush', async () => {
    const calls: string[] = [];
    queueJob(() => calls.push('job'));
    queuePostFlushCb(() => calls.push('post'));
    await nextTick(() => calls.push('tick'));
    expect(calls).toEqual(['job', 'post', 'tick']);
  });

  test('calls fn with the bound this and resolves to its awaited result', async () => {
    const context = { name: 'ctx', nextTick };
    const result = await context.nextTick(async function () {
      return this.name;
    });
    expect(result).toBe('ctx');
  });

  test('rejects when fn throws, without failing the flush', async () => {
    const err = new Error('fn');
    await expect(
      nextTick(() => {
        throw err;
      }),
    ).rejects.toBe(err);
    const calls: string[] = [];
    queueJob(() => calls.push('job'));
    await nextTick();
    expect(calls).toEqual(['job']);
  });
});

describe('a throwing error report', () => {
  test('ends the flush with the error and runs the jobs left in a new flush', async () => {
    const report = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
      .mockImplementationOnce(() => {
        throw new Error('console');
      });
    const calls: string[] = [];
    const failing = job(() => {
      throw new Error('job');
    });
    queueJob(failing);
    queueJob(() => calls.push('next'));
    queuePostFlushCb(() => calls.push('post'));
    await expect(nextTick()).rejects.toThrow('console');
    await nextTick();
    expect(calls).toEqual(['next', 'post']);
    queueJob(failing);
    await nextTick();
    expect(report).toHaveBeenCalledTimes(2);
  });

  test('keeps the post callbacks left when a post callback fails', async () => {
    vi.spyOn(console, 'error')
      .mockImplementation(() => {})
      .mockImplementationOnce(() => {
        throw new Error('console');
      });
    const calls: string[] = [];
    queuePostFlushCb([
      job(() => {
        throw new Error('post');
      }, 1),
      job(() => calls.push('post 2'), 2),
    ]);
    await expect(nextTick()).rejects.toThrow('console');
    await nextTick();
    expect(calls).toEqual(['post 2']);
  });
});

describe('recursion guard', () => {
  test('in dev, a job queued again after 100 runs in one flush reports VIBE5101 and is skipped', async () => {
    const { reported } = spyErrors();
    let runs = 0;
    const recursive: SchedulerJob = job(
      () => {
        runs++;
        queueJob(recursive);
      },
      undefined,
      ALLOW_RECURSE,
    );
    const after = vi.fn<() => void>();
    queueJob(recursive);
    queuePostFlushCb(after);
    await nextTick();
    expect(runs).toBe(100);
    expect(after).toHaveBeenCalledTimes(1);
    const [{ info, cause }] = reported();
    expect(info).toBe('scheduler flush');
    expect(cause).toMatchObject({ code: 'VIBE5101', args: { component: 'outside a component' } });
    expect(reported()).toHaveLength(1);
  });

  test('in prod, there is no guard: a job may re-queue itself 150 times', async () => {
    vi.stubGlobal('__DEV__', false);
    const { reported } = spyErrors();
    let runs = 0;
    const recursive: SchedulerJob = job(
      () => {
        if (++runs < 150) queueJob(recursive);
      },
      undefined,
      ALLOW_RECURSE,
    );
    queueJob(recursive);
    await nextTick();
    expect(runs).toBe(150);
    expect(reported()).toEqual([]);
  });
});
