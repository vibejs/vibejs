# HMR

## VIBE5501: HMR record missing

> Hot module replacement found no record for the component {id}, so the page was reloaded.

In development builds, each `.vibe` module registers its component for hot module replacement when it first loads, and later edits update the live instances through that record. An update for a component without a record cannot be applied in place, so the page reloads instead.

### Fix

- Save the file again, or reload the page, to load the component with its record.
- Load the `.vibe` module through the vibe.js Vite plugin, which adds the registration to each component in development.
