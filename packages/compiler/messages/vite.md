# Vite plugin

These codes come from the `vibe()` Vite plugin of `@usevibejs/compiler/vite`.

## VIBE4901: Component imported on the server

> `{file}` is imported by server code, but `.vibe` components run only in the browser.

vibe.js renders components on the client. A server environment, such as server-side rendering or a Node test environment, cannot load a `.vibe` file.

### Fix

- Import `.vibe` files only from client code.
- Run component tests in a DOM environment such as jsdom, happy-dom or browser mode.

## VIBE4902: Package version mismatch

> `@usevibejs/ui` is at version {ui}, but `@usevibejs/compiler` is at version {compiler}.

Compiled components call the runtime of `@usevibejs/ui` through an interface that changes with each release, so the compiler and the runtime must have the same version. The version `none` means that `@usevibejs/ui` is not installed in the project.

### Fix

- Install the same version of every `@usevibejs/*` package.

## VIBE4903: Dependency component is not opted in

> `{file}` is in node_modules, and its package does not set `vibejs.sfc` to true.

The bundler compiles `.vibe` files that belong to the application. It also compiles a `.vibe` file shipped by a dependency when that package's `package.json` contains `"vibejs": { "sfc": true }`. Every other `.vibe` file in `node_modules` is left uncompiled, so an import of one cannot load.

### Fix

- Set `vibejs.sfc` to true in the package.json of the package that ships {file}.
- Copy the component into the application when the package is yours to own.
