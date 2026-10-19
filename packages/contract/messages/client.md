# Client

## VIBE9091: Missing path param

> The call to "{path}" is missing the path param "{param}".

A client call fills each `:param` of the route's full path from `input.params`. The call rejects before any request is sent when one of them is `undefined`. The types already require every path param, so this happens only when the input is cast or built at run time.

### Fix

- Pass `params.{param}` in the call input.
- Check that the route path "{path}" is the one you meant to call.
