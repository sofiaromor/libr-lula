import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveBaseTitle,
  hasEditionMarker,
  normalizedAuthorIdentity,
  normalizedIdentity,
  titleSimilarity,
  workIdentityKey,
} from "../src/lib/bookIdentity.js";

test("normalizedIdentity normalizes accents, case and punctuation", () => {
  assert.equal(
    normalizedIdentity("  Cien años de soledad!!! "),
    "cien anos de soledad",
  );
});

test("normalizedAuthorIdentity ignores author prefix and token order", () => {
  assert.equal(
    normalizedAuthorIdentity("por Gabriel García Márquez"),
    normalizedAuthorIdentity("Márquez Gabriel García"),
  );
});

test("hasEditionMarker detects edition descriptions", () => {
  assert.equal(hasEditionMarker("Edición especial ilustrada"), true);
  assert.equal(hasEditionMarker("Novela histórica"), false);
});

test("deriveBaseTitle removes edition and series suffixes", () => {
  assert.equal(deriveBaseTitle("Dune (Edición especial)"), "Dune");
  assert.equal(deriveBaseTitle("Dune - Tapa dura"), "Dune");
  assert.equal(deriveBaseTitle("Dune (Saga #1)"), "Dune");
});

test("deriveBaseTitle preserves unrelated parenthetical text", () => {
  assert.equal(
    deriveBaseTitle("Dune (Frank Herbert)"),
    "Dune (Frank Herbert)",
  );
});

test("deriveBaseTitle prefers an explicit base title", () => {
  assert.equal(
    deriveBaseTitle("Dune - Edición especial", "Dune original"),
    "Dune original",
  );
});

test("workIdentityKey identifies equivalent title and author variants", () => {
  assert.equal(
    workIdentityKey("Cien años de soledad", "Gabriel García Márquez"),
    workIdentityKey(
      "Cien años de soledad - Edición especial",
      "Márquez Gabriel García",
    ),
  );
});

test("titleSimilarity returns full similarity for equivalent normalized titles", () => {
  assert.equal(
    titleSimilarity("Cien años de soledad", "Cien Años de Soledad"),
    1,
  );
});

test("titleSimilarity returns zero when there are no shared title tokens", () => {
  assert.equal(titleSimilarity("Dune", "Drácula"), 0);
});
