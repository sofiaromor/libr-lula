import test from "node:test";
import assert from "node:assert/strict";

import {
  collectionBookLabel,
  collectionFollowerLabel,
  normalizeCollectionVisibility,
} from "../src/lib/collectionPresentation.js";

test("collection visibility fails closed to private", () => {
  assert.equal(normalizeCollectionVisibility("public"), "public");
  assert.equal(normalizeCollectionVisibility("private"), "private");
  assert.equal(normalizeCollectionVisibility("anything"), "private");
});

test("collection counters use singular and plural labels", () => {
  assert.equal(collectionBookLabel(1), "1 libro");
  assert.equal(collectionBookLabel(3), "3 libros");
  assert.equal(collectionFollowerLabel(1), "1 seguidor");
  assert.equal(collectionFollowerLabel(8), "8 seguidores");
});
