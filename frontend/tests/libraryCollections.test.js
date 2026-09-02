import test from "node:test";
import assert from "node:assert/strict";

import { COLLECTION_ACCENT_OPTIONS } from "../src/lib/libraryCollections.js";

test("collection accent palette is finite and uses hex colors", () => {
  assert.ok(COLLECTION_ACCENT_OPTIONS.length >= 6);
  assert.equal(new Set(COLLECTION_ACCENT_OPTIONS).size, COLLECTION_ACCENT_OPTIONS.length);
  for (const color of COLLECTION_ACCENT_OPTIONS) {
    assert.match(color, /^#[0-9a-fA-F]{6}$/);
  }
});

test("collection palette keeps Librélula default accent first", () => {
  assert.equal(COLLECTION_ACCENT_OPTIONS[0], "#b8896a");
});
