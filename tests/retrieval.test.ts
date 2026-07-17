import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMetric } from "../bridge/device";

test("retrieval summary uses the most common readable key value", () => {
  const metric = summarizeMetric([0, 200, 200, 200, 150], 100, true);
  assert.deepEqual(metric, {
    representativeMm: 2,
    minMm: 1.5,
    maxMm: 2,
    matchingKeys: 3,
    readableKeys: 4,
  });
});
