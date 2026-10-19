# Decorators

## VIBE9301: Legacy decorators required

> {decorator} was called with a standard decorator context, but the server decorators need `experimentalDecorators`.

The server decorators use the TypeScript legacy decorator signature. Without `experimentalDecorators`, the compiler passes a standard decorator context instead, and some build tools leave the `@` syntax in their output, where no runtime can execute it.

### Fix

- Set `"experimentalDecorators": true` in `compilerOptions` of the server `tsconfig.json`.

## VIBE9302: Missing @Controller

> {controller} is listed in `controllers` of {module}, but neither it nor a parent class has `@Controller()`.

A controller serves the routes of exactly one contract, which `@Controller(contract)` names.

### Fix

- Add `@Controller(contract)` to the class {controller}.
- Remove {controller} from `controllers` of {module}.

## VIBE9303: Route not handled

> The route {route} of the contract of {controller} has no handler.

A controller handles every route of its contract, so that no declared route is left without an answer.

### Fix

- Add a method to {controller} with `@Handle(contract.route)` for {route}.

## VIBE9304: Route handled twice

> The route {route} is handled by more than one method of {controller}: {methods}.

Each route has exactly one handler.

### Fix

- Keep one handler for {route} and remove `@Handle()` from the other methods.

## VIBE9305: Foreign route

> The method {controller}.{method} handles a route that is not part of the contract of {controller}.

`@Handle()` takes a route of the contract named in `@Controller()`. A route of another contract, or a route spec that `defineContract()` has not bound, cannot be served by this controller.

### Fix

- Pass a route of this controller's contract to `@Handle()` on {method}.
- Move {method} to the controller of the contract that declares its route.

## VIBE9306: Contract served twice

> More than one controller serves the same contract: {controllers}.

A contract belongs to exactly one controller, so each route has a single handler in the application.

### Fix

- Merge the controllers {controllers} into one.
- Split the contract into one contract per controller.

## VIBE9307: Static handler

> The handler {controller}.{method} is static, but `@Handle()` needs an instance method.

Handlers run on the controller instance that the container creates, so they can use its injected fields.

### Fix

- Remove `static` from {controller}.{method}.
