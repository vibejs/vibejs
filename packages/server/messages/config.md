# Config

## VIBE9601: Invalid configuration

> The environment variables do not match the config schema: {issues}.

`defineConfig()` validates every listed environment variable when the config class is created and reports every failing key at once. The message lists the keys and the schema messages, never the values.

### Fix

- Set the listed environment variables to values that match their schemas.

## VIBE9602: Asynchronous config schema

> The config schema of {key} validates asynchronously, but a config is validated synchronously.

The config class is created by a constructor, so its schemas must return their result without a promise.

### Fix

- Use a synchronous schema for {key}, without async checks or transforms.
