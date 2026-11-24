// ══════════════════════════════════════════════════════════════
// Keeping the tool contract that zod 3 published
// ══════════════════════════════════════════════════════════════
// Moving from zod 3 to zod 4 changes two things an MCP client can see, without any change
// to a single schema in this package.
//
// 1. THE VALIDATION MESSAGES. The SDK returns the zod issue messages as the text of the
//    -32602 error a client gets for a bad call. Zod 4 rewrote every default message
//    ("Expected string, received number" became "Invalid input: expected string, received
//    number"). A host model, or a client that matches on that text, would see a different
//    answer for the same bad input. zod3LocaleError below rebuilds the zod 3 English text
//    for the issue kinds these tools can raise, and hands anything else to the zod 4
//    English locale. Messages set on a schema itself still win over it, as before.
//
// 2. THE ADVERTISED JSON SCHEMA. With zod 3 the SDK converted every z.object to a schema
//    with additionalProperties: false. Zod 4 converts input schemas without it. Unknown keys
//    are stripped in both versions, so validation is the same, but the schema a client reads
//    in tools/list would say more keys are welcome. keepClosedObjects puts the old value back
//    through zod's own metadata registry, which is what zod 4 merges into its JSON schema.
import { z } from "zod";

const quoteJoin = (values: readonly unknown[]): string =>
  values.map((v) => (typeof v === "string" ? `'${v}'` : String(v))).join(" | ");

/** The name zod 3 gave the type of a value in "received ..." (its getParsedType). */
function zod3TypeName(data: unknown): string {
  switch (typeof data) {
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "object":
      if (data === null) return "null";
      if (Array.isArray(data)) return "array";
      if (data instanceof Date) return "date";
      if (data instanceof Map) return "map";
      if (data instanceof Set) return "set";
      if (typeof (data as any).then === "function" && typeof (data as any).catch === "function") return "promise";
      return "object";
    default:
      return typeof data;
  }
}

const zod3Expected: Record<string, string> = { int: "integer", record: "object" };

/** The zod 3 English message for a zod 4 issue, or undefined when zod 3 had no equivalent. */
export function zod3Message(iss: any): string | undefined {
  const received = zod3TypeName(iss.input);
  switch (iss.code) {
    case "invalid_type":
      if (iss.input === undefined) return "Required";
      // zod 3 reported a non-integer number as its own type, "float".
      if (iss.expected === "int" && received === "number") return "Expected integer, received float";
      return `Expected ${zod3Expected[iss.expected] ?? iss.expected}, received ${received}`;
    case "invalid_value":
      if (iss.input === undefined) return "Required";
      // zod 3 split this one in two: a string that is not an option, and a value that is
      // not even the right type, which it reported as a type error against the options.
      if (iss.values.every((v: unknown) => typeof v === "string")) {
        if (typeof iss.input === "string") return `Invalid enum value. Expected ${quoteJoin(iss.values)}, received '${iss.input}'`;
        return `Expected ${quoteJoin(iss.values)}, received ${received}`;
      }
      return undefined;
    case "too_small": {
      const how = iss.exact ? "exactly" : iss.inclusive ? "at least" : undefined;
      if (iss.origin === "array") return `Array must contain ${how ?? "more than"} ${iss.minimum} element(s)`;
      if (iss.origin === "string") return `String must contain ${how ?? "over"} ${iss.minimum} character(s)`;
      if (iss.origin === "number")
        return `Number must be ${iss.exact ? "exactly equal to " : iss.inclusive ? "greater than or equal to " : "greater than "}${iss.minimum}`;
      return undefined;
    }
    case "too_big": {
      const how = iss.exact ? "exactly" : iss.inclusive ? "at most" : undefined;
      if (iss.origin === "array") return `Array must contain ${how ?? "less than"} ${iss.maximum} element(s)`;
      if (iss.origin === "string") return `String must contain ${how ?? "under"} ${iss.maximum} character(s)`;
      if (iss.origin === "number")
        return `Number must be ${iss.exact ? "exactly" : iss.inclusive ? "less than or equal to" : "less than"} ${iss.maximum}`;
      return undefined;
    }
    case "invalid_format":
      if (iss.format === "regex") return "Invalid";
      if (iss.format === "email" || iss.format === "url" || iss.format === "uuid") return `Invalid ${iss.format}`;
      return undefined;
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${iss.keys.map((k: string) => `'${k}'`).join(", ")}`;
    case "invalid_union":
      return "Invalid input";
    default:
      return undefined;
  }
}

const zod4English = z.locales.en().localeError!;
const zod3LocaleError = (iss: any) => zod3Message(iss) ?? zod4English(iss);
z.config({ localeError: zod3LocaleError });

/** Mark every plain object schema reachable from `schema` with additionalProperties: false
 *  in zod's metadata registry, so its JSON schema matches what zod 3 produced. Objects with
 *  a catchall are left alone, because zod 3 did not close those either. */
export function keepClosedObjects(schema: unknown, seen = new Set<unknown>()): void {
  const def = (schema as any)?._zod?.def;
  if (!def || seen.has(schema)) return;
  seen.add(schema);
  if (def.type === "object") {
    if (!def.catchall) {
      const meta = z.globalRegistry.get(schema as z.ZodType) ?? {};
      z.globalRegistry.add(schema as z.ZodType, { ...meta, additionalProperties: false });
    }
    for (const child of Object.values(def.shape ?? {})) keepClosedObjects(child, seen);
    return;
  }
  for (const key of ["innerType", "element", "keyType", "valueType", "in", "out"]) keepClosedObjects(def[key], seen);
  for (const option of def.options ?? []) keepClosedObjects(option, seen);
}
