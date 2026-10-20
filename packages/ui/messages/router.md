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

`createRouter()` accepts `history`, `routes` and `scrollBehavior`, and a route record accepts `path`, `name`, `component`, `props`, `children`, `redirect`, `meta` and `beforeEnter`. Any other key fails, so that a misspelled or unsupported option is never ignored silently.

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

A navigation by `name`, `router.resolve()` and `RouterLink` look the name up among the routes passed to `createRouter()`, nested children included. A name that no route declares cannot be turned into a path, so the navigation throws.

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

## VIBE7111: No router installed

> {api} needs a router, but the app has none installed.

The router composables read the router that `app.use(router)` provides. They work in the setup of a component of that app, and in guards, redirects, lazy loaders and `afterEach` hooks of the router.

### Fix

- Install the router with `app.use(router)` before mounting the app.
- In a test, pass the router in the `plugins` option of `mount()`.
- Call {api} in a component's setup, not in a timer or an event handler.

## VIBE7112: Route guard outside a RouterView

> {api} was called outside a page that a RouterView renders, so the guard is ignored.

A guard of a page runs while the route record that its RouterView shows is leaving or updating. A component that no RouterView renders has no such record. This is a warning, printed in development builds only, so that a page can be tested on its own.

### Fix

- Call {api} in the setup of a route component, or of a component inside it.
- Use `router.beforeEach()` for a guard that does not belong to a page.

## VIBE7113: Route name not matched

> useRoute('{name}') was called while the route {path} is shown, which is not {name} or one of its children.

`useRoute(name)` narrows the route to the params of `name`, so it checks that a record named `name` is matched.

### Fix

- Call `useRoute()` without a name in a component that several routes render, and narrow with `route.name === '{name}'`.
- Pass the name of the route that renders this component.

## VIBE7114: External link in RouterLink

> RouterLink cannot navigate to the external URL {to}.

A RouterLink navigates inside the app. A URL with a scheme, such as `https:` or `mailto:`, or one that starts with `//`, leaves it.

### Fix

- Use `<a href="{to}">` for a link that leaves the app.
- Pass a path inside the app, such as `/about`, or a named location.

## VIBE7115: RouterView with slot content

> RouterView does not take slot content.

A RouterView renders the component of the matched route. Content between its tags is not supported.

### Fix

- Remove the content between `<RouterView>` and `</RouterView>`.
- Put a layout around the view in the parent route's component instead.

## VIBE7116: Scroll target not found

> No element matches the scroll target {el}.

After a navigation, the router scrolls to the element of the hash or of the `el` that `scrollBehavior` returns. This is a warning, printed in development builds only.

### Fix

- Give the target element the id of the hash, such as `id="details"` for `#details`.
- Return a selector or an element that exists once the new route rendered.

## VIBE7117: Web history without a window

> createWebHistory() needs a browser window, but this environment has none.

A web history reads and writes the URL of the browser window.

### Fix

- Use `createMemoryHistory()` in tests and in environments without a window.
- Create the router in code that runs only in the browser.

## VIBE7118: Invalid param value

> The param {param} of the route {route} must be {expected}.

A param declared with `+` or `*` takes an array, and `+` needs at least one item. Any other param takes a single string or number. A value cannot be `.` or `..`, because a URL removes it as a dot segment.

### Fix

- Pass an array for a repeatable param, such as `['a', 'b']` for `/:segments+`.
- Pass a single value for a param without `+` or `*`.
- Pass a value other than `.` or `..` for {param}.
