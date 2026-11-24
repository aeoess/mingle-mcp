/** The zod 3 English message for a zod 4 issue, or undefined when zod 3 had no equivalent. */
export declare function zod3Message(iss: any): string | undefined;
/** Mark every plain object schema reachable from `schema` with additionalProperties: false
 *  in zod's metadata registry, so its JSON schema matches what zod 3 produced. Objects with
 *  a catchall are left alone, because zod 3 did not close those either. */
export declare function keepClosedObjects(schema: unknown, seen?: Set<unknown>): void;
