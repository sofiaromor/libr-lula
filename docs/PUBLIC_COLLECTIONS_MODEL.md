# Librélula · Public Collections Model

## Product principle

A reading **status** answers: “where am I with this book?”

A **collection** answers: “why do these books belong together for me?”

Collections are therefore social/editorial objects, not aliases for `reading`, `completed` or `planned`.

## Collection properties

- owner (`profiles.id`)
- name
- optional description
- accent color from a safe product palette
- visibility: `private` or `public`
- ordered books
- follower count
- created/updated timestamps

## Public profile

The profile should expose a `Colecciones` tab with cards inspired by physical shelves. Each card shows:

- collection name;
- count of books;
- follower count when public;
- a compact preview of 3–5 covers;
- accent border/background;
- owner controls only when viewing own profile.

Public visitors can open and follow a public collection. Private collections never appear in another user's profile.

## Suggested examples

- Otoño cozy
- Mis cinco estrellas
- Romantasy para obsesionarse
- Clásicos que quiero leer
- Libros que me rompieron

## Data model

### `library_collections`

One row per collection.

### `library_collection_books`

Ordered many-to-many relationship between collections and catalog books.

### `library_collection_follows`

One follow per authenticated user + public collection.

## Security

RLS is mandatory. Owners can mutate their own collections. Everyone may read public collections; owners may also read their private collections. Collection-book rows inherit visibility from their parent collection. Following is only possible for public collections and only as the authenticated user.

No production migration is applied without explicit human approval.
