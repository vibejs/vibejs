# Testing

## VIBE7201: No element matches the selector

> get({selector}) found no element in the rendered HTML: {html}

`get()` returns the first element that matches a CSS selector and fails when none does, so a test that expects the element stops at the query and shows what was rendered.

### Fix

- Compare the selector with the rendered HTML above.
- Await the action that renders the element, such as `trigger()`, `setProps()` or `flushPromises()`, before the query.
- Use `find()` and `exists()` when the element is expected to be absent.

## VIBE7202: Missing element used

> find({selector}) found no element, so {method}() cannot run on it.

`find()` returns an empty wrapper when no element matches, so that `exists()` can check for absence. Every other call on the empty wrapper fails with this error.

### Fix

- Use `get()` when the element must exist: it fails at the query and shows the rendered HTML.
- Check `exists()` before using the wrapper when the element may be absent.

## VIBE7203: Event name with a modifier

> trigger() received the event name {event}, which has a modifier: pass the key in the event init instead, as in {example}.

`trigger()` dispatches a native event, whose name has no modifiers. Keys and modifier keys are properties of the event.

### Fix

- Pass the key as `key` in the event init, such as `key: 'Enter'` for `keydown.enter`.
- Pass modifier keys as booleans in the event init, such as `ctrlKey: true` for `click.ctrl`.

## VIBE7204: Element without a value

> setValue() cannot set a value on a <{tag}> element.

`setValue()` sets the value of an `<input>`, a `<textarea>` or a `<select>`, or the checked state of a checkbox or a radio, and dispatches the events that a user's input would.

### Fix

- Query the form control itself, such as `get('input')`, before calling `setValue()`.
- Use `trigger()` to dispatch events on other elements.

## VIBE7205: Wrapper used after unmount

> The wrapper of {name} was used after the component unmounted.

After `unmount()`, or after the test that mounted it finished, the component's nodes are removed, so its wrappers have nothing left to read or act on.

### Fix

- Read what the test checks before calling `unmount()`.
- Mount the component again in each test that uses it, for example in `beforeEach()`.

## VIBE7206: Unsupported mount option

> mount() does not take the option {option}: {fix}.

`mount()` takes `props`, `slots`, `provide`, `plugins` and `attachTo`. Plugins and provided values are top-level options, children render as they do in the app, and attributes are passed with the props.

### Fix

- Pass `plugins` and `provide` as top-level options of `mount()`.
- Replace a child component with a mock of its module, as in `vi.mock('./Child.vibe')`.
- Pass attributes and the starting state of the component in `props`.

## VIBE7207: Several root elements

> The component renders {count} root elements, so its wrapper has no single element.

A component wrapper reads its element, attributes, classes and visibility from the component's root element. A component whose template has several roots, or none, has no such element.

### Fix

- Query the element first, as in `get('header')`, and use that wrapper.
- Use `html()` or `text()`, which read every root node.

## VIBE7208: Attach target not found

> mount() could not find the attachTo element {selector}.

`attachTo` takes an element or a CSS selector for one, and the component renders into a new element appended to it.

### Fix

- Check that the document has an element that matches {selector} before calling `mount()`.
- Pass the element itself instead of a selector.
