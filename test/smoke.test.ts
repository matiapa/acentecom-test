import { expect, test } from "vitest";
import { ok } from "../src/smoke.js";

test("smoke: toolchain runs", () => {
  expect(ok()).toBe(true);
});
