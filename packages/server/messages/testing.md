# Testing

## VIBE9701: Unused provider override

> {module} overrides {token}, but no module of the application provides it.

`overrideProvider()` replaces a provider by its token in every module that provides it, before anything is built. Only providers can be overridden: controllers, guards, interceptors, filters and module classes cannot, and neither can a token that the application never provides.

### Fix

- Provide {token} in a module that the testing module imports, or add its provider to the testing module's `providers`.
- Remove the `overrideProvider({token})` call.
