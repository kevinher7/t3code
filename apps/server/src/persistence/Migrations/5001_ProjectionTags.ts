import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_tags (
      tag_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_tags_updated_at
      ON projection_tags(updated_at)
  `;

  // Idempotent ALTER TABLE: SQLite throws if the column already exists, so we
  // catch and turn it into a no-op. The DEFAULT '[]' ensures every existing
  // row decodes through `Schema.fromJsonString(Schema.Array(TagId))`.
  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'
  `.pipe(Effect.catch(() => Effect.void));
});
