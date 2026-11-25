// ══════════════════════════════════════════════════════════════
// Tool input schemas keep additionalProperties: false
// ══════════════════════════════════════════════════════════════
// With zod 3 the SDK converted every plain z.object in a tool input schema to a JSON schema
// with additionalProperties: false. Zod 4 converts input schemas without it. Unknown keys are
// stripped in both versions, so what a tool accepts is the same. But the schema a client reads
// in tools/list would say that more keys are welcome. closeToolInputSchema puts the old value
// back.
//
// It uses only public zod 4 API:
// - schema.def, the typed definition that zod 4 exposes on every classic and mini schema,
//   to walk the schema tree.
// - z.globalRegistry, the metadata registry that z.toJSONSchema merges into its output.
//
// The SDK calls z.toJSONSchema itself and takes no override hook, so metadata is the one
// public way to change its output. .strict() would also print additionalProperties: false,
// but it makes zod refuse unknown keys instead of stripping them. That changes which inputs
// a tool accepts, so it is not used here.
//
// test/tools-list-snapshot.test.ts holds the whole tools/list output to a committed snapshot,
// so a zod or SDK release that changes this fails the test suite.
import { z } from "zod";

type Def = z.core.$ZodTypeDef;

/** The public definition of a zod 4 schema, or undefined for anything else. */
function defOf(schema: unknown): Def | undefined {
  const def = (schema as { def?: unknown } | null | undefined)?.def;
  return def && typeof def === "object" && typeof (def as Def).type === "string" ? (def as Def) : undefined;
}

/** Mark every plain object schema reachable from `schema` with additionalProperties: false in
 *  zod's metadata registry. Objects with a catchall are left alone: zod 3 did not close loose
 *  ones, and zod 4 already closes strict ones. Metadata already on a schema, such as its
 *  description, is kept. */
export function keepClosedObjects(schema: unknown, seen = new Set<unknown>()): void {
  const def = defOf(schema);
  if (!def || seen.has(schema)) return;
  seen.add(schema);
  const walk = (child: unknown) => keepClosedObjects(child, seen);
  switch (def.type) {
    case "object": {
      const d = def as z.core.$ZodObjectDef;
      if (!d.catchall) {
        const target = schema as z.core.$ZodType;
        z.globalRegistry.add(target, { ...(z.globalRegistry.get(target) ?? {}), additionalProperties: false });
      }
      Object.values(d.shape).forEach(walk);
      return;
    }
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
      walk((def as z.core.$ZodOptionalDef).innerType);
      return;
    case "array":
      walk((def as z.core.$ZodArrayDef).element);
      return;
    case "record": {
      const d = def as z.core.$ZodRecordDef;
      walk(d.keyType);
      walk(d.valueType);
      return;
    }
    case "union":
      (def as z.core.$ZodUnionDef).options.forEach(walk);
      return;
    case "intersection": {
      const d = def as z.core.$ZodIntersectionDef;
      walk(d.left);
      walk(d.right);
      return;
    }
    case "pipe": {
      const d = def as z.core.$ZodPipeDef;
      walk(d.in);
      walk(d.out);
      return;
    }
    default:
      return;
  }
}

/** Close the input schema the SDK built for one registered tool. A tool with an empty shape is
 *  left alone. Under zod 3 the SDK already built that one with zod 4 (z.object({}) from
 *  zod/v4-mini) and published it without additionalProperties, so leaving it keeps that. */
export function closeToolInputSchema(inputSchema: unknown): void {
  const shape = (inputSchema as { shape?: Record<string, unknown> } | null | undefined)?.shape;
  if (shape && Object.keys(shape).length > 0) keepClosedObjects(inputSchema);
}
