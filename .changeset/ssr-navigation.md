---
'@usevibejs/ui': minor
---

Add `renderToStringAsync()` so the first route is in the HTML document, and `hydrateAsync()` so the client reuses that document. A JSON `state` value round-trips through `readServerState()` for a query cache.
