# Scheduler

## VIBE5101: Too many recursive updates

> A scheduled job ran 100 times in one flush and was queued again, so it was skipped: a watcher or an update writes a value that it also reads.

Each write to a value that a job reads queues the job again. When the job writes to that value every time it runs, the queue never empties. In development builds the scheduler stops such a job after 100 runs in one flush and reports this error, so that the rest of the flush still runs.

### Fix

- Derive the value with `computed()` instead of writing it from a watcher of its own source.
- Guard the write with a condition that becomes false once the value is settled.

## VIBE5102: Unhandled error

> An error thrown in a {info} was not handled.

The scheduler and watchers catch the errors of the code they run, so that the remaining jobs of the flush still run. An error that nothing handles is printed with this message, and the original error is its `cause`.

### Fix

- Catch the error inside the {info} where it can be handled.
- Read the `cause` of this error for the original error and its stack.
