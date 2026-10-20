# create-vibejs

## VIBE8101: Target not an empty directory

> `{dir}` is not an empty directory; create-vibejs writes a new project only into an empty or missing directory.

The scaffolder never overwrites or merges files, so an existing project is never changed by accident.

### Fix

- Pass the name of a new directory, as in `npm create vibejs@latest my-app`.
- Empty `{dir}` first if it holds nothing you need.

## VIBE8102: Invalid package name

> `{name}` is not a valid npm package name.

The directory name becomes the `name` in the new project's `package.json`, so it must be a valid npm package name: lowercase letters, digits, `-`, `.`, `_` and `~`, not starting with `.` or `_`, at most 214 characters.

### Fix

- Use a name such as `my-app`.

## VIBE8103: Install failed

> `{command}` failed in `{dir}`; the project files are kept.

create-vibejs wrote the project and then ran the package manager's install, which failed, often because of the network or the registry. The output of the install is shown with the error.

### Fix

- Run `{command}` in `{dir}` again.

## VIBE8104: Missing or invalid arguments

> {problem}. Usage: create-vibejs [dir] [--pm pnpm|npm|yarn|bun] [--no-install]

The scaffolder takes the project directory and two options. In agent mode (`VIBEJS_AGENT=1`, or when the output is not a terminal) it never prompts, so the directory must be given; the JSON output lists it in `error.missing` with an example.

### Fix

- Run `npm create vibejs@latest my-app`.
