# Modules

## VIBE9201: Not a module

> {module} is imported at {path}, but the class has no `@Module()` decorator.

Every entry of `imports`, and the `module` class of a dynamic module, must carry its own `@Module()`. The decorator is not inherited, so a subclass of a module class is not a module until it is decorated itself.

### Fix

- Add the `@Module()` decorator to the class {module}; an empty options object is enough.
- Import the module class itself instead of a class derived from it.

## VIBE9202: Module import cycle

> The modules import each other in a cycle: {cycle}.

Modules are scanned depth-first, and each module is set up after the modules it imports, so two modules cannot import each other.

### Fix

- Move the providers that both modules need into a third module and import it in both.

## VIBE9203: Invalid export

> {module} exports {export}, which is neither one of its providers nor one of its imports.

A module can export the tokens of its own providers and the modules it imports. Exporting an imported module makes that module's exports visible to the importer.

### Fix

- If {export} is a provider token, add its provider to `providers` of {module}.
- If {export} is a module, add it to `imports` of {module}.

## VIBE9204: Shutdown hooks failed

> {count} shutdown hooks failed: {hooks}.

Every `onModuleDestroy` and `onApplicationShutdown` hook runs even when an earlier one fails. The errors are collected in an `AggregateError`, which is the `cause` of this error.

### Fix

- Read `cause.errors` of this error and fix each hook that is listed.
