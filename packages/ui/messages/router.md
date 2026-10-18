# Router

## VIBE7101: Invalid route path

> The route path {path} is invalid: {reason}.

A route path is a list of segments separated by `/`. Each segment is either static text or exactly one param: `:name`, then an optional `(regex)`, then an optional `?` (optional), `*` (zero or more) or `+` (one or more). `createRouter()` checks every path, so an invalid one fails at startup.

### Fix

- Give each param its own segment: `/files/:name` instead of `/file.:ext` or `/:a-:b`.
- Remove `\` escapes and any `/` from param regexes, and close every parenthesis.
- Give a param at most one non-empty regex: `:id(\d+)`, not `:id()` or `:id(a)(b)`.
- Remove `?` and `#` from static text, and `.` and `..` segments, which a URL removes or reads as a query or a hash.
- Check that the param regex compiles with `new RegExp()`.
- Start every top-level path with `/`; only child paths are relative.

## VIBE7102: Duplicate route name

> The route name {name} is used by more than one route.

Navigation by name needs every name to point to exactly one route.

### Fix

- Rename one of the routes named {name}.
- Remove the `name` of a route that is only reached by its path.

## VIBE7103: Unsupported router option

> {option} in {where} is not supported: {deferral}.

`createRouter()` accepts `history` and `routes`, and a route record accepts `path`, `name`, `component`, `children`, `redirect`, `meta` and `beforeEnter`. Any other key fails, so that a misspelled or unsupported option is never ignored silently.

### Fix

- Remove {option} from {where}.
- Check the spelling of {option} against the supported keys.

## VIBE7104: Missing route param

> The route {route} needs a value for its param {param}.

A named navigation builds the path from `params`. A required param must have a non-empty value.

### Fix

- Pass the param {param} in `params` when navigating to {route}.
- Mark the param optional in the route path with `?` or `*` when the route works without it.

## VIBE7105: Unknown route name

> No route is named {name}.

### Fix

- Use the `name` of a route passed to `createRouter()`.
- Navigate by path when the route has no name.

## VIBE7106: No route matches

> No route matches the path {path}.

The navigation continues with an empty `matched` list, so nothing is rendered for it. This is a warning, printed in development builds only.

### Fix

- Add a route for {path}.
- Add a catch-all route last, such as `/:pathMatch(.*)*`, to show a not-found page.

## VIBE7107: Guard with a next parameter

> The navigation guard {guard} declares {count} parameters, but a guard takes only to and from.

A navigation guard decides with its return value, so there is no third callback parameter to call.

### Fix

- Return `false` to cancel the navigation, a location to redirect, or nothing to continue.
- Remove the third parameter of {guard}.

### Example

```ts
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isSignedIn()) return { name: 'login' };
  if (to.meta.locked) return false;
});
```

## VIBE7108: Redirect loop

> The navigation to {path} redirected more than 10 times.

Route redirects and guard redirects share one counter per navigation. More than 10 redirects usually mean that two routes or guards redirect to each other.

### Fix

- Make the guard return nothing when `to` is already the redirect target.
- Remove the `redirect` that points back to a route that redirects to it.

## VIBE7109: Lazy route component failed to load

> The component of the route {path} failed to load.

The `cause` of the error is the rejection of the loader. After a deploy, an open page can request a chunk that no longer exists.

### Fix

- Handle the error in `router.onError()`, for example by loading `to.fullPath` as a full page.
- Check that the loader of {path} imports an existing file.

## VIBE7110: Lazy loader returned no component

> The loader of the route {path} resolved to {type}, not a component.

A lazy `component` is a function that returns a promise of a component or of a module whose `default` export is a component.

### Fix

- Return the module from the loader, as in `() => import('./Page.vibe')`.
- Export the component as the `default` export of the loaded module.

## VIBE7118: Invalid param value

> The param {param} of the route {route} must be {expected}.

A param declared with `+` or `*` takes an array, and `+` needs at least one item. Any other param takes a single string or number. A value cannot be `.` or `..`, because a URL removes it as a dot segment.

### Fix

- Pass an array for a repeatable param, such as `['a', 'b']` for `/:segments+`.
- Pass a single value for a param without `+` or `*`.
- Pass a value other than `.` or `..` for {param}.
