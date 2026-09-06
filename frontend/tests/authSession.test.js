import test from "node:test";
import assert from "node:assert/strict";

test("verification codes are six numeric characters", () => {
  assert.match("123456", /^\d{6}$/);
  assert.doesNotMatch("12345a", /^\d{6}$/);
});
