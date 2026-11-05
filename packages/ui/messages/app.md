# App

## VIBE5301: Unsupported app API

> app.{api}() is not supported.

A vibe.js app has no global components, custom directives or mixins. Components are imported where they are used, element behavior goes in composables that use template refs, and shared logic goes in composables. The method exists only to report this error, which is thrown in every build.

### Fix

- Import the component in the `<script setup>` that uses it.
- Move the shared logic into a composable, a function that calls the composition API.
- Use `useTemplateRef()` with `onMounted()` instead of a custom directive.

## VIBE5302: App already mounted

> The app is already mounted, so the second app.mount() did nothing.

An app renders its root component once. Calling `mount()` again, even after `unmount()`, does not render it again, and this warning is reported in development builds.

### Fix

- Call `createApp()` again for each mount.
- Call `app.mount()` once, after every `app.use()` and `app.provide()`.

## VIBE5303: Mount target not found

> app.mount() could not find the element {target}.

`app.mount()` takes an element or a CSS selector for one. When the selector matches nothing, the app has nowhere to render, so this error is thrown in every build.

### Fix

- Check that the page has an element that matches {target}, such as `<div id="app"></div>`.
- Run the script after the element exists, for example as a module script, which runs after the document is parsed.

## VIBE5304: Invalid or repeated plugin

> app.use() received {problem}.

A plugin is a function or an object with an `install` function, and `app.use()` installs each plugin once. An invalid value or a second install of the same plugin is ignored, and this warning is reported in development builds.

### Fix

- Pass the plugin function or the object with `install` to `app.use()`, not the result of calling it.
- Call `app.use()` once per plugin.

## VIBE5306: Server render of a mounted app

> renderToString() received an app that is already mounted.

`renderToString()` and `renderToStringAsync()` mount the app into their own document and read the HTML back. An app can mount only once, so a second render, or a render after `mount()`, has nothing new to draw.

### Fix

- Call `renderToString()` with a new app from `createApp()`.
- Do not call `mount()` on an app that `renderToString()` will render.

## VIBE5307: Hydration mismatch

> The HTML already in the container does not match what the client rendered.

`hydrate()` reuses the nodes a server render put in the container. When a tag or a text is different, the client does not rebuild the tree. The container is left as it was, and this error is thrown in every build.

### Fix

- Render the same app with `renderToString()` and hydrate that HTML.
- Pass the element that contains the server markup, not an empty element.

## VIBE5308: Hydrate of a mounted app

> hydrate() received an app that is already mounted.

An app attaches to a container once. `hydrate()` and `hydrateAsync()` do not attach an app that `mount()` or `hydrate()` already attached.

### Fix

- Call `hydrate()` with a new app from `createApp()`.
- Do not call `mount()` before `hydrate()`.

## VIBE5309: Server state is not JSON

> The state passed to renderToStringAsync() cannot be written as JSON.

`renderToStringAsync()` writes `state` into the document as JSON. A cycle, a function, or `undefined` has no JSON text, so this error is thrown in every build.

### Fix

- Pass a JSON value: plain objects, arrays, strings, numbers, booleans, or `null`.
- Omit `state` when the page has nothing to embed.

## VIBE5310: Invalid server state

> The server state in the document is not valid JSON.

`readServerState()` reads the `#vibe-state` script that `renderToStringAsync()` wrote. The script is empty or its JSON is damaged, so this error is thrown in every build.

### Fix

- Embed state with `renderToStringAsync()`.
- Leave the `#vibe-state` script as that render wrote it.

## VIBE5305: Unmount before mount

> app.unmount() was called on an app that is not mounted.

An app is unmounted after it was mounted, once. Unmounting an app that was never mounted, or a second time, does nothing, and this warning is reported in development builds.

### Fix

- Call `app.unmount()` only after `app.mount()`.
- Keep track of whether the app is mounted when several places may unmount it.
