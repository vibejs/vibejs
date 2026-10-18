# Dependency injection

## VIBE9101: inject() outside an injection context

> inject({token}) was called outside an injection context.

`inject()` reads the provider scope of the class or factory that the container is building at that moment. That context exists only while a constructor runs (field initializers and the constructor body), during the synchronous part of a factory and inside `runInInjectionContext()`. It ends at the first `await`, and a class created with `new` outside the container has none.

### Fix

- Move `inject({token})` into a field initializer, such as `private readonly dep = inject({token})`.
- Call `inject()` before the first `await` of a factory or of a `runInInjectionContext()` callback.
- List {token} in the `inject` array of the factory and take it as a factory parameter.

### Example

```ts
class UsersService {
  private readonly db = inject(Db);
}
```

## VIBE9102: No provider

> No provider for {token} is visible in {module} (requested by {chain}).

A module sees its own providers, the providers exported by the modules it imports and the providers of global modules. The chain lists each dependent, ending in the missing token.

### Fix

- Add {token} to `providers` of {module}.
- Import a module that exports {token} into {module}.
- Pass the option `optional: true` to `inject({token})` when the dependency may be absent.

## VIBE9103: Circular dependency

> Circular dependency in {module}: {cycle}.

Every provider is created once, before the application starts, so two providers cannot each need the other to exist first.

### Fix

- Move the part that both providers need into a third provider and inject it in both.

## VIBE9104: Constructor parameters

> The class {token} declares constructor parameters, but the container creates providers with no arguments.

Classes listed as providers are created with `new Cls()`. Dependencies are read with `inject()` in field initializers, so they stay explicit under every compiler.

### Fix

- Replace each constructor parameter with an `inject()` field, such as `private db = inject(Db)`.

### Example

```ts
class UsersService {
  private readonly db = inject(Db);
}
```

## VIBE9105: Provider creation failed

> Creating {token} in {module} failed.

The constructor or the factory of the provider threw, or the factory returned a promise that rejected. The original error is the `cause` of this error.

### Fix

- Read the `cause` of this error and fix the constructor or factory of {token}.

## VIBE9106: Async provider not ready

> {requester} needs {token} before its factory has settled.

All factories are awaited before any other class is created, so a class built earlier on behalf of a factory can only inject factories that have already settled.

### Fix

- Add {token} to the factory's `inject` list, before {requester}.

## VIBE9107: Invalid provider

> A provider must be a class or an object with `provide` and exactly one of `useClass`, `useValue`, `useFactory` or `useExisting`.

A provider entry is either a class with no constructor parameters or an object that names the token in `provide` and says how to create its value.

### Fix

- List the class itself, or set `provide` and exactly one of `useClass`, `useValue`, `useFactory` or `useExisting`.
