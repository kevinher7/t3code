/**
 * Integration test for the custom set-difference migration runner. The
 * runner under test reads the FULL set of applied migration ids from
 * `effect_sql_migrations` and skips any registered migration whose id is in
 * that set. This guarantees a downstream migration with a high id (e.g.,
 * `5001`) never silently blocks a future upstream migration with a low id
 * (e.g., `27`) from running.
 */

import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { __runWithLoaderForTesting } from "./Migrations.ts";
import * as NodeSqliteClient from "./NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

// `it.layer` from `@effect/vitest` builds the layer with `Effect.cached`, so
// the in-memory SQLite is shared across sibling `it.effect` blocks. Each test
// here seeds `effect_sql_migrations` from scratch, so we drop every user
// table before (re)creating the tracking table to guarantee isolation.
const resetMigrationsState = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{
    readonly name: string;
  }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    .withoutTransform;
  for (const { name } of tables) {
    yield* sql`DROP TABLE IF EXISTS ${sql(name)}`;
  }
  yield* sql`
    CREATE TABLE effect_sql_migrations (
      migration_id integer PRIMARY KEY NOT NULL,
      created_at datetime NOT NULL DEFAULT current_timestamp,
      name VARCHAR(255) NOT NULL
    )
  `;
});

const seedAppliedIds = (rows: ReadonlyArray<readonly [id: number, name: string]>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    for (const [id, name] of rows) {
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
    }
  });

const buildSyntheticLoader = (
  entries: ReadonlyArray<readonly [id: number, name: string]>,
): Migrator.Loader =>
  Effect.succeed(
    entries.map(([id, name]) => {
      const markerTable = `synthetic_marker_${id}`;
      // The `unknown` error matches the shape of `Migrator.ResolvedMigration`'s
      // load effect; the runner narrows this at its boundary.
      // @effect-diagnostics anyUnknownInErrorContext:off
      const create: Effect.Effect<void, unknown, SqlClient.SqlClient> = Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`CREATE TABLE IF NOT EXISTS ${sql(markerTable)} (id integer)`;
      });
      return [id, name, Effect.succeed(create)] as const;
    }),
  );

const tableExists = (table: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly name: string;
    }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}`.withoutTransform;
    return rows.length === 1;
  });

const listAppliedIds = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{
    readonly migration_id: number;
  }>`SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id ASC`.withoutTransform;
  return rows.map((row) => row.migration_id);
});

layer("MigrationsRunner — set-difference semantics", (it) => {
  it.effect("runs a registered migration with id below the current max applied id", () =>
    Effect.gen(function* () {
      // Seed: an environment that has already applied [1, 2, 5001].
      yield* resetMigrationsState;
      yield* seedAppliedIds([
        [1, "InitialSchema"],
        [2, "Followup"],
        [5001, "DownstreamFeature"],
      ]);

      // Loader registers id `3` (newer-than-2 in the upstream band) plus the
      // pre-applied ids. The runner must run only `3`.
      const loader = buildSyntheticLoader([
        [1, "InitialSchema"],
        [2, "Followup"],
        [3, "Synthetic"],
        [5001, "DownstreamFeature"],
      ]);

      const executed = yield* __runWithLoaderForTesting(loader);

      assert.deepStrictEqual(
        executed.map(([id]) => id),
        [3],
      );
      assert.strictEqual(yield* tableExists("synthetic_marker_3"), true);
      assert.strictEqual(yield* tableExists("synthetic_marker_1"), false);
      assert.strictEqual(yield* tableExists("synthetic_marker_5001"), false);
      assert.deepStrictEqual(yield* listAppliedIds, [1, 2, 3, 5001]);
    }),
  );

  it.effect("is idempotent on re-run with the same loader", () =>
    Effect.gen(function* () {
      yield* resetMigrationsState;
      yield* seedAppliedIds([
        [1, "InitialSchema"],
        [2, "Followup"],
        [5001, "DownstreamFeature"],
      ]);

      const loader = buildSyntheticLoader([
        [1, "InitialSchema"],
        [2, "Followup"],
        [3, "Synthetic"],
        [5001, "DownstreamFeature"],
      ]);

      yield* __runWithLoaderForTesting(loader);
      const secondExecuted = yield* __runWithLoaderForTesting(loader);

      assert.deepStrictEqual(secondExecuted, []);
      assert.deepStrictEqual(yield* listAppliedIds, [1, 2, 3, 5001]);
    }),
  );
});
