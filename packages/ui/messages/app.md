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

## VIBE5305: Unmount before mount

> app.unmount() was called on an app that is not mounted.

An app is unmounted after it was mounted, once. Unmounting an app that was never mounted, or a second time, does nothing, and this warning is reported in development builds.

### Fix

- Call `app.unmount()` only after `app.mount()`.
- Keep track of whether the app is mounted when several places may unmount it.
