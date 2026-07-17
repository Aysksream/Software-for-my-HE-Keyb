import assert from "node:assert/strict";
import test from "node:test";
import { findMatchingGame, normalizeProcessName } from "../bridge/processes";

test("normalizes executable suffix and casing", () => {
  assert.equal(normalizeProcessName("  VALORANT.exe "), "valorant");
});

test("matches configured games exactly after normalization", () => {
  assert.equal(findMatchingGame(["explorer", "cs2"], ["CS2.exe"]), "cs2");
  assert.equal(findMatchingGame(["leagueclient"], ["league"]), null);
});
