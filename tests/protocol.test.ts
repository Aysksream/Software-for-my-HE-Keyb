import assert from "node:assert/strict";
import test from "node:test";
import { bit7Checksum, buildCommand, decodeU16Values, precisionFactorFromFirmware, profileToReports } from "../src/lib/protocol";
import { DEFAULT_PROFILES } from "../src/lib/types";

test("buildCommand creates a 65-byte HID feature report with Bit7 checksum", () => {
  const report = buildCommand(0x03, [0]);
  assert.equal(report.length, 65);
  assert.equal(report[0], 0);
  assert.equal(report[1], 0x03);
  assert.equal(report[8], bit7Checksum(report.slice(1)));
  assert.equal(report[8], 0xfc);
});

test("game profile builds polling, paged trigger, deadzone, and mode reports", () => {
  const reports = profileToReports(DEFAULT_PROFILES.game);
  assert.equal(reports.length, 80);
  assert.ok(reports.every((report) => report.length === 65));
  assert.equal(reports[0][1], 0x03);
  assert.equal(reports.at(-1)?.[1], 0x65);
  assert.equal(reports.at(-1)?.[2], 0x07);
  assert.equal(reports.at(-1)?.[3], 0x00);
  assert.equal(reports.at(-1)?.[4], 60);
  assert.equal(reports.at(-1)?.[5], 1);
  assert.equal(reports.at(-1)?.[9], 0x80);
});

test("firmware precision matches the MonsGeek RY5088 conversion thresholds", () => {
  assert.equal(precisionFactorFromFirmware(767), 10);
  assert.equal(precisionFactorFromFirmware(768), 100);
  assert.equal(precisionFactorFromFirmware(1279), 100);
  assert.equal(precisionFactorFromFirmware(1280), 200);
});

test("decodes multi-page little-endian trigger values", () => {
  assert.deepEqual(decodeU16Values([0xc8, 0x00, 0x2c, 0x01], 2), [200, 300]);
});
