# Librélula · Library UX V2

## Product direction

`Mi biblioteca` is a private, app-like reading workspace. The public profile is the social showcase.

### Private library

- visual first, not filter first;
- compact search + view toggle + one `Filtros` action;
- no permanent full-height sidebar on mobile;
- system shelves (`Leyendo`, `Leídos`, `Pendientes`) shown as cozy shelf rows;
- `Leídos` ranks by score descending, then recency;
- each visual row ends in a wooden shelf rail;
- pagination is per shelf, not one global infinite list;
- cover/spine view can be switched without changing the shelf organization;
- personal spine photos are edited to the exact spine crop before saving.

### Photo crop model

The original personal spine image remains private. Cropping is non-destructive: store `crop_x`, `crop_y`, and `crop_zoom` with the user/book record, and render the image inside a fixed spine viewport. This avoids repeated image recompression and lets the user re-edit later.

### Filters

Primary browsing should not depend on a filter panel. The default screen is organized by shelf. Search and advanced filters open from a compact toolbar. On mobile, advanced filters use a bottom sheet; on desktop, a floating popover/drawer.

### Public profile

Public profile should expose `Colecciones`, not the private organizational UI.

A collection can have:

- name and short description;
- accent color;
- public/private visibility;
- ordered books;
- follower count;
- owner-only edit controls;
- a public card/preview on the profile.

Examples: `Mis romantasy favoritas`, `Libros que me rompieron`, `Otoño cozy`, `Clásicos pendientes`.

### Separation of concepts

- **Reading status** (`reading`, `completed`, `planned`, etc.) is system state.
- **Shelf row** is a system presentation of that state.
- **Collection** is user-created editorial curation and may be public/followable.

Keeping these separate avoids mixing operational reading state with social identity.

## Rollout

1. PR A — personal spine foundation (existing).
2. PR B — crop editor, compact filters, shelf rows and pagination.
3. PR C — custom collections, public profile cards and follows.
4. Production migrations only after explicit human approval and RLS review.
