import assert from "node:assert/strict";
import test from "node:test";
import { allowedOrigins, isLoopbackHost, validateApiRequest } from "../bridge/security";

const port = 3815;
const origins = allowedOrigins(port, "https://fun60.example");

test("accepts only loopback Host headers on the configured port", () => {
  assert.equal(isLoopbackHost("127.0.0.1:3815", port), true);
  assert.equal(isLoopbackHost("localhost:3815", port), true);
  assert.equal(isLoopbackHost("attacker.example:3815", port), false);
  assert.equal(isLoopbackHost("127.0.0.1:8080", port), false);
});

test("allows configured browser origins with guarded JSON writes", () => {
  assert.equal(validateApiRequest({
    host: "127.0.0.1:3815",
    origin: "https://fun60.example",
    method: "PUT",
    contentType: "application/json; charset=utf-8",
    controlHeader: "1",
  }, port, origins), null);
});

test("rejects arbitrary websites and DNS-rebinding hosts", () => {
  assert.equal(validateApiRequest({
    host: "127.0.0.1:3815",
    origin: "https://attacker.example",
    method: "GET",
  }, port, origins)?.status, 403);
  assert.equal(validateApiRequest({
    host: "attacker.example:3815",
    origin: "https://fun60.example",
    method: "GET",
  }, port, origins)?.status, 403);
});

test("rejects cross-site and form-style mutation attempts", () => {
  assert.equal(validateApiRequest({
    host: "127.0.0.1:3815",
    fetchSite: "cross-site",
    method: "GET",
  }, port, origins)?.status, 403);
  assert.equal(validateApiRequest({
    host: "127.0.0.1:3815",
    origin: "http://127.0.0.1:3815",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    controlHeader: "1",
  }, port, origins)?.status, 415);
  assert.equal(validateApiRequest({
    host: "127.0.0.1:3815",
    origin: "http://127.0.0.1:3815",
    method: "POST",
    contentType: "application/json",
  }, port, origins)?.status, 403);
});
