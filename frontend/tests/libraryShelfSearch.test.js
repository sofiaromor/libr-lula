import test from "node:test";
import assert from "node:assert/strict";

import {
  filterShelfItems,
  formatShelfScore,
  normalizeShelfScore,
} from "../src/lib/libraryShelfSearch.js";

const ITEMS = [
  { book_id: "1", score: 5, book: { title: "Los diablos", author: "Joe Abercrombie" } },
  { book_id: "2", score: 4, book: { title: "La paciente silenciosa", author: "Alex Michaelides" } },
  { book_id: "3", score: 0, book: { title: "Circe", author: "Madeline Miller" } },
];

test("shelf search matches title or author without accents or case sensitivity", () => {
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "DIABLOS" }).map((item) => item.book_id),
    ["1"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "paciente silenciosa" }).map((item) => item.book_id),
    ["2"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "michaelides" }).map((item) => item.book_id),
    ["2"],
  );
});

test("shelf score filter supports exact ratings and unrated books", () => {
  assert.deepEqual(
    filterShelfItems(ITEMS, { score: "5" }).map((item) => item.book_id),
    ["1"],
  );
  assert.deepEqual(
    filterShelfItems(ITEMS, { score: "unrated" }).map((item) => item.book_id),
    ["3"],
  );
});

test("shelf search and score filter combine without changing source order", () => {
  assert.deepEqual(
    filterShelfItems(ITEMS, { query: "a", score: "4" }).map((item) => item.book_id),
    ["2"],
  );
});

test("shelf score labels fail safely for missing or invalid ratings", () => {
  assert.equal(normalizeShelfScore(5), 5);
  assert.equal(normalizeShelfScore("3"), 3);
  assert.equal(normalizeShelfScore(7), 0);
  assert.equal(formatShelfScore(4), "4/5");
  assert.equal(formatShelfScore(null), "Sin puntuar");
});
