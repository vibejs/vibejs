# 0009. Server rendering

- Status: Accepted
- Date: 2026-11-05

## Context

vibe.js renders in the browser. `mount` writes a component into a DOM node, and the compiler's output is the client runtime. Applications that need HTML in the first response have nowhere to produce it. `createHead()` and `useHead()` collect `title`, `meta`, and `link` tags as plain records so a later render can write them into a document.

## Decision

- The same compiler output that runs in the browser renders to a string on the server. There is no second compiler for the server.
- Hydration reuses the DOM the server produced. A mismatch is a VIBE code.
- `mount` remains the way a SPA starts. It is not replaced.
- Query dehydration and hydration belong to `@usevibejs/query`.
- The first release returns one complete HTML string. Streaming HTML is a later release.

## Consequences

- `renderToString` and `hydrate` are not implemented with this record. They follow once this decision is in place.
- Head tags are data. The string renderer can emit them without a document object, and the browser applies the same records.
- A hydration mismatch is reported with a stable code. The client does not silently rebuild the tree.

## Alternatives considered

- **A separate server compiler.** One compiler output keeps the browser and the server on the same component code.
- **Making hydration the only entry.** Applications that do not render on the server keep `mount`.
- **Dehydrating queries in the runtime.** Server state stays in `@usevibejs/query`.
- **Streaming the first HTML release.** A full string ships first. Streaming HTML waits for a later release.
