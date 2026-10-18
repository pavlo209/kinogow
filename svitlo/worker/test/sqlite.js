import { DatabaseSync } from "node:sqlite";

// Те саме API, що й ctx.storage.sql у Durable Object: exec(query, ...bindings).
export function memorySql() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(query, ...bindings) {
      const rows = db.prepare(query).all(...bindings).map((row) => ({ ...row }));
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}`);
          return rows[0];
        },
      };
    },
  };
}
