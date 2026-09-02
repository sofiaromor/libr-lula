import test from "node:test";
import assert from "node:assert/strict";

import {
  collectionBookLabel,
  collectionFollowerLabel,
  normalizeCollectionVisibility,
} from "../src/lib/collectionPresentation.js";

test("unknown collection visibility is private", () => {
  assert.equal(normalizeCollectionVisibility("public"), "public");
  assert.equal(normalizeCollectionVisibility("private"), "private");
  assert.equal(normalizeCollectionVisibility("unexpected"), "private");
});

test("collection count labels are readable and never negative", () => {
  assert.equal(collectionBookLabel(1), "1 libro");
  assert.equal(collectionBookLabel(2), "2 libros");
  assert.equal(collectionBookLabel(-5), "0 libros");
  assert.equal(collectionFollowerLabel(1), "1 seguidor");
  assert.equal(collectionFollowerLabel(2), "2 seguidores");
  assert.equal(collectionFollowerLabel(-2), "0 seguidores");
});
