import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("5001_ProjectionTags", (it) => {
  it.effect("creates projection_tags table with primary key and unique normalized name", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 26 });
      yield* runMigrations({ toMigrationInclusive: 5001 });

      yield* sql`
          INSERT INTO projection_tags (
            tag_id,
            name,
            name_normalized,
            created_at,
            updated_at
          ) VALUES (
            't1',
            'Foo',
            'foo',
            '2026-04-01T00:00:00.000Z',
            '2026-04-01T00:00:00.000Z'
          )
        `;

      const rows = yield* sql<{
        readonly tagId: string;
        readonly name: string;
        readonly nameNormalized: string;
      }>`
          SELECT
            tag_id AS "tagId",
            name,
            name_normalized AS "nameNormalized"
          FROM projection_tags
        `;
      assert.deepStrictEqual(rows, [{ tagId: "t1", name: "Foo", nameNormalized: "foo" }]);

      const insertConflict = yield* Effect.exit(
        sql`
            INSERT INTO projection_tags (
              tag_id,
              name,
              name_normalized,
              created_at,
              updated_at
            ) VALUES (
              't2',
              'foo',
              'foo',
              '2026-04-01T00:00:01.000Z',
              '2026-04-01T00:00:01.000Z'
            )
          `,
      );
      assert.strictEqual(insertConflict._tag, "Failure");
    }),
  );

  it.effect("adds tags_json column to projection_projects with default '[]'", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 26 });

      yield* sql`
          INSERT INTO projection_projects (
            project_id,
            title,
            workspace_root,
            default_model_selection_json,
            scripts_json,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (
            'p1',
            'Project',
            '/tmp/p1',
            NULL,
            '[]',
            '2026-04-01T00:00:00.000Z',
            '2026-04-01T00:00:00.000Z',
            NULL
          )
        `;

      yield* runMigrations({ toMigrationInclusive: 5001 });

      const rows = yield* sql<{
        readonly tags_json: string;
      }>`
          SELECT tags_json FROM projection_projects WHERE project_id = 'p1'
        `;
      assert.deepStrictEqual(rows, [{ tags_json: "[]" }]);
    }),
  );

  it.effect("is idempotent on re-run", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 5001 });
      yield* runMigrations({ toMigrationInclusive: 5001 });

      const tableRows = yield* sql<{
        readonly name: string;
      }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projection_tags'`;
      assert.strictEqual(tableRows.length, 1);
    }),
  );
});
