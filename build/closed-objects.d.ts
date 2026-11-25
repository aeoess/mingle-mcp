/** Mark every plain object schema reachable from `schema` with additionalProperties: false in
 *  zod's metadata registry. Objects with a catchall are left alone: zod 3 did not close loose
 *  ones, and zod 4 already closes strict ones. Metadata already on a schema, such as its
 *  description, is kept. */
export declare function keepClosedObjects(schema: unknown, seen?: Set<unknown>): void;
/** Close the input schema the SDK built for one registered tool. A tool with an empty shape is
 *  left alone. Under zod 3 the SDK already built that one with zod 4 (z.object({}) from
 *  zod/v4-mini) and published it without additionalProperties, so leaving it keeps that. */
export declare function closeToolInputSchema(inputSchema: unknown): void;
