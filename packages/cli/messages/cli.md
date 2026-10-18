# CLI core

## VIBE8003: Missing required input

> Missing required input `{name}` for `vibejs {command}`.

The command needs a value that was not given. The CLI never prompts for it, so a coding agent gets the same answer as a person: the JSON output lists the missing input in `error.missing` with an example, and `next` holds a complete command to run.

### Fix

- Pass `{name}` as shown in `vibejs {command} --help`.
- Run the command from `next` in the JSON output.

## VIBE8004: Unknown command or option

> Unknown command or option `{name}`.

The first word after `vibejs` must be a command, and every option must belong to that command or be one of the global options `--json`, `--help` and `--version`. A command takes only the arguments its usage lists. For a common mistake, `next` suggests the intended command.

### Fix

- Run `vibejs --help` to list the commands and their options.
- Run the command from `next` in the JSON output.

## VIBE8008: Unknown error code

> No error code `{code}` in the catalog of this vibejs version.

`vibejs explain` and `vibejs docs` read the error catalog that ships with the installed CLI, so they work offline. A code is missing when it is mistyped or when it comes from a newer vibe.js version than the installed one.

### Fix

- Check the spelling: a code is `VIBE` followed by four digits.
- Update the vibe.js packages in this project if the code comes from a newer version.
