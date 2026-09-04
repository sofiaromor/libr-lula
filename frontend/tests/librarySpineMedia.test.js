import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpineStoragePath,
  LIBRARY_SPINE_MAX_BYTES,
  normalizeLibraryViewMode,
  normalizePersonalSpineShowText,
  shouldShowSpineTitle,
  validateSpineImageFile,
} from "../src/lib/librarySpineMedia.js";

test("library view mode fails back to covers", () => {
  assert.equal(normalizeLibraryViewMode("spines"), "spines");
  assert.equal(normalizeLibraryViewMode("covers"), "covers");
  assert.equal(normalizeLibraryViewMode("anything"), "covers");
  assert.equal(normalizeLibraryViewMode(null), "covers");
});

test("personal spine text defaults to hidden unless explicitly enabled", () => {
  assert.equal(normalizePersonalSpineShowText(true), true);
  assert.equal(normalizePersonalSpineShowText(false), false);
  assert.equal(normalizePersonalSpineShowText("true"), false);
  assert.equal(normalizePersonalSpineShowText(undefined), false);
});

test("generated spines always keep a title while personal photos honor the preference", () => {
  assert.equal(shouldShowSpineTitle({ hasPersonalSpine: false, showText: false }), true);
  assert.equal(shouldShowSpineTitle({ hasPersonalSpine: true, showText: true }), true);
  assert.equal(shouldShowSpineTitle({ hasPersonalSpine: true, showText: false }), false);
  assert.equal(shouldShowSpineTitle({ hasPersonalSpine: true }), false);
});

test("personal spine accepts supported image types within the size limit", () => {
  assert.deepEqual(
    validateSpineImageFile({ type: "image/jpeg", size: 1024 }),
    { valid: true, error: "" },
  );
  assert.deepEqual(
    validateSpineImageFile({ type: "image/webp", size: LIBRARY_SPINE_MAX_BYTES }),
    { valid: true, error: "" },
  );
});

test("personal spine rejects unsupported or oversized media", () => {
  assert.equal(
    validateSpineImageFile({ type: "image/heic", size: 1024 }).valid,
    false,
  );
  assert.equal(
    validateSpineImageFile({
      type: "image/jpeg",
      size: LIBRARY_SPINE_MAX_BYTES + 1,
    }).valid,
    false,
  );
});

test("personal spine rejects missing and empty files", () => {
  assert.equal(validateSpineImageFile(null).valid, false);
  assert.equal(validateSpineImageFile({ type: "image/png", size: 0 }).valid, false);
});

test("storage path stays inside the authenticated user prefix", () => {
  const path = buildSpineStoragePath({
    userId: "abc-123",
    bookId: "../../book / weird",
    fileType: "image/png",
    now: 123456,
  });

  assert.equal(path, "abc-123/book-weird/spine-123456.png");
  assert.equal(path.includes(".."), false);
});
