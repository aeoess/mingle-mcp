// The zod 4 move keeps the messages and the advertised schemas that zod 3 gave clients.
// The expected strings below are the zod 3.25 English messages for the same inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { keepClosedObjects } from "../src/zod3-compat.js";

const messages = (schema: z.ZodType, input: unknown) => {
  const r = schema.safeParse(input);
  assert.equal(r.success, false);
  return r.error!.issues.map((i) => i.message);
};

test("zod3 messages: type errors, required, integer", () => {
  const s = z.object({ name: z.string(), n: z.number().int().optional(), on: z.boolean().optional(), list: z.array(z.string()).optional(), rec: z.record(z.string(), z.string()).optional() });
  assert.deepEqual(messages(s, {}), ["Required"]);
  assert.deepEqual(messages(s, { name: 1 }), ["Expected string, received number"]);
  assert.deepEqual(messages(s, { name: "x", n: 1.5 }), ["Expected integer, received float"]);
  assert.deepEqual(messages(s, { name: "x", n: "1" }), ["Expected number, received string"]);
  assert.deepEqual(messages(s, { name: "x", on: "yes" }), ["Expected boolean, received string"]);
  assert.deepEqual(messages(s, { name: "x", list: null }), ["Expected array, received null"]);
  assert.deepEqual(messages(s, { name: "x", rec: 5 }), ["Expected object, received number"]);
});

test("zod3 messages: enums", () => {
  const e = z.enum(["a", "b"]);
  assert.deepEqual(messages(e, "c"), ["Invalid enum value. Expected 'a' | 'b', received 'c'"]);
  assert.deepEqual(messages(e, 3), ["Expected 'a' | 'b', received number"]);
  assert.deepEqual(messages(z.object({ e }), {}), ["Required"]);
});

test("zod3 messages: sizes and formats", () => {
  assert.deepEqual(messages(z.string().max(2), "abc"), ["String must contain at most 2 character(s)"]);
  assert.deepEqual(messages(z.string().min(1), ""), ["String must contain at least 1 character(s)"]);
  assert.deepEqual(messages(z.array(z.string()).min(1), []), ["Array must contain at least 1 element(s)"]);
  assert.deepEqual(messages(z.array(z.string()).max(1), ["a", "b"]), ["Array must contain at most 1 element(s)"]);
  assert.deepEqual(messages(z.number().min(1), 0), ["Number must be greater than or equal to 1"]);
  assert.deepEqual(messages(z.number().max(60), 61), ["Number must be less than or equal to 60"]);
  assert.deepEqual(messages(z.string().email(), "nope"), ["Invalid email"]);
  assert.deepEqual(messages(z.string().regex(/^a$/), "b"), ["Invalid"]);
  // A message set on the schema itself still wins, as it did under zod 3.
  assert.deepEqual(messages(z.string().regex(/^a$/, "must be a"), "b"), ["must be a"]);
});

test("keepClosedObjects: nested plain objects advertise additionalProperties false", () => {
  const inner = z.object({ a: z.string() });
  const top = z.object({ o: inner.optional().describe("d"), l: z.array(z.object({ b: z.number() })).optional() });
  keepClosedObjects(top);
  const js: any = z.toJSONSchema(top, { target: "draft-7", io: "input" });
  assert.equal(js.additionalProperties, false);
  assert.equal(js.properties.o.additionalProperties, false);
  assert.equal(js.properties.o.description, "d", "existing metadata is kept");
  assert.equal(js.properties.l.items.additionalProperties, false);
  // Unknown keys are still stripped rather than refused, which is what zod 3 did.
  assert.deepEqual(top.parse({ o: { a: "x", extra: 1 }, extra: 2 }), { o: { a: "x" } });
});
