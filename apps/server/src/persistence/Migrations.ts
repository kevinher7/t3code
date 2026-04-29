/**
 * MigrationsLive - Migration runner with inline loader
 *
 * Uses a custom set-difference runner over Migrator.fromRecord to define migrations inline.
 * All migrations are statically imported - no dynamic file system loading.
 *
 * Migrations run automatically when the MigrationLayer is provided,
 * ensuring the database schema is always up-to-date before the application starts.
 */

import * as Migrator from "effect/unstable/sql/Migrator";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

// Import all migrations statically
import Migration0001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration0002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration0003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration0004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration0005 from "./Migrations/005_Projections.ts";
import Migration0006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration0008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration0009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration0010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration0011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration0013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration0014 from "./Migrations/014_ProjectionThreadProposedPlanImplementation.ts";
import Migration0015 from "./Migrations/015_ProjectionTurnsSourceProposedPlan.ts";
import Migration0016 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration0017 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration0018 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration0019 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration0020 from "./Migrations/020_AuthAccessManagement.ts";
import Migration0021 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration0022 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration0023 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration0024 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration0025 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";
import Migration0026 from "./Migrations/026_CanonicalizeModelSelectionOptions.ts";
import Migration5001 from "./Migrations/5001_ProjectionTags.ts";

/**
 * Migration loader with all migrations defined inline.
 *
 * Key format: "{id}_{name}" where:
 * - id: numeric migration ID (determines execution order)
 * - name: descriptive name for the migration
 *
 * Uses Migrator.fromRecord which parses the key format and
 * returns migrations sorted by ID.
 *
 * Banded migration id convention:
 * - Upstream band: ids `1..999`. The next upstream id is `27`. Downstream files
 *   in this band are reserved for upstream merges only.
 * - Downstream-only band: ids `>= 5000`. The first downstream-only migration
 *   is `5001_ProjectionTags`. The 4000-id gap is intentional headroom against
 *   upstream growth.
 *
 * The custom runner below uses set-difference semantics over the
 * `effect_sql_migrations` tracking table so an applied downstream migration
 * (e.g., `5001`) does not silently block a future upstream migration (e.g.,
 * `27`) from running.
 */
export const migrationEntries = [
  [1, "OrchestrationEvents", Migration0001],
  [2, "OrchestrationCommandReceipts", Migration0002],
  [3, "CheckpointDiffBlobs", Migration0003],
  [4, "ProviderSessionRuntime", Migration0004],
  [5, "Projections", Migration0005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration0006],
  [7, "ProjectionThreadMessageAttachments", Migration0007],
  [8, "ProjectionThreadActivitySequence", Migration0008],
  [9, "ProviderSessionRuntimeMode", Migration0009],
  [10, "ProjectionThreadsRuntimeMode", Migration0010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration0011],
  [12, "ProjectionThreadsInteractionMode", Migration0012],
  [13, "ProjectionThreadProposedPlans", Migration0013],
  [14, "ProjectionThreadProposedPlanImplementation", Migration0014],
  [15, "ProjectionTurnsSourceProposedPlan", Migration0015],
  [16, "CanonicalizeModelSelections", Migration0016],
  [17, "ProjectionThreadsArchivedAt", Migration0017],
  [18, "ProjectionThreadsArchivedAtIndex", Migration0018],
  [19, "ProjectionSnapshotLookupIndexes", Migration0019],
  [20, "AuthAccessManagement", Migration0020],
  [21, "AuthSessionClientMetadata", Migration0021],
  [22, "AuthSessionLastConnectedAt", Migration0022],
  [23, "ProjectionThreadShellSummary", Migration0023],
  [24, "BackfillProjectionThreadShellSummary", Migration0024],
  [25, "CleanupInvalidProjectionPendingApprovals", Migration0025],
  [26, "CanonicalizeModelSelectionOptions", Migration0026],
  [5001, "ProjectionTags", Migration5001],
] as const;

export const makeMigrationLoader = (throughId?: number): Migrator.Loader =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

/**
 * Build a Migrator-like runner that uses **set-difference** semantics over
 * `effect_sql_migrations` instead of Effect's stock "max id" strategy. This
 * mirrors `Migrator.make` from `effect/unstable/sql/Migrator.ts:74-296`
 * line-for-line with two surgical changes:
 *
 * 1. Replace the single-row `latestMigration` query with a set-loading query:
 *    read **all** rows from `effect_sql_migrations` and build a `Set<number>`
 *    of applied ids.
 * 2. Replace `if (currentId <= latestMigrationId) continue` with
 *    `if (appliedIds.has(currentId)) continue`.
 *
 * The `effect_sql_migrations` schema is untouched; existing deployments adopt
 * the new runner with no DB migration of the migration tracker itself.
 */
const makeRunner =
  (): ((options: {
    readonly loader: Migrator.Loader;
    readonly table?: string;
  }) => Effect.Effect<
    ReadonlyArray<readonly [id: number, name: string]>,
    Migrator.MigrationError | SqlError,
    SqlClient.SqlClient
  >) =>
  ({ loader, table = "effect_sql_migrations" }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const ensureMigrationsTable = sql.onDialectOrElse({
        mssql: () =>
          sql`IF OBJECT_ID(N'${sql.literal(table)}', N'U') IS NULL
  CREATE TABLE ${sql(table)} (
    migration_id INT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE()
  )`,
        mysql: () =>
          sql`CREATE TABLE IF NOT EXISTS ${sql(table)} (
  migration_id INTEGER UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (migration_id)
)`,
        pg: () =>
          Effect.catch(sql`select ${table}::regclass`, () =>
            sql`CREATE TABLE ${sql(table)} (
  migration_id integer primary key,
  created_at timestamp with time zone not null default now(),
  name text not null
)`.asEffect(),
          ),
        orElse: () =>
          sql`CREATE TABLE IF NOT EXISTS ${sql(table)} (
  migration_id integer PRIMARY KEY NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp,
  name VARCHAR(255) NOT NULL
)`,
      });

      const insertMigrations = (rows: ReadonlyArray<readonly [id: number, name: string]>) =>
        sql`INSERT INTO ${sql(table)} ${sql.insert(
          rows.map(([migration_id, name]) => ({ migration_id, name })),
        )}`.withoutTransform;

      const loadAppliedIds = Effect.map(
        sql<{
          readonly migration_id: number;
        }>`SELECT migration_id FROM ${sql(table)}`.withoutTransform,
        (rows) => new Set<number>(rows.map((row) => row.migration_id)),
      );

      // Wrap each loaded migration into a typed effect that always fails with
      // a `MigrationError` (success: void). This contains the upstream
      // `Effect<any, any, SqlClient>` shape from `Migrator.ResolvedMigration`
      // at a single boundary so the rest of the runner stays free of `any`.
      // The `unknown` error here is irreducible — migration files declare
      // arbitrary failure types that we collapse into MigrationError below.
      // @effect-diagnostics anyUnknownInErrorContext:off
      const wrapMigration = (
        id: number,
        name: string,
        loadedEffect: Effect.Effect<unknown, unknown, SqlClient.SqlClient>,
      ): Effect.Effect<void, Migrator.MigrationError, SqlClient.SqlClient> =>
        loadedEffect.pipe(
          Effect.asVoid,
          Effect.mapError(
            (error) =>
              new Migrator.MigrationError({
                cause: error,
                kind: "Failed",
                message: `Migration "${id}_${name}" failed`,
              }),
          ),
        );

      type WrappedMigration = readonly [
        id: number,
        name: string,
        effect: Effect.Effect<void, Migrator.MigrationError, SqlClient.SqlClient>,
      ];

      // === run

      const run = Effect.gen(function* () {
        yield* sql.onDialectOrElse({
          pg: () => sql`LOCK TABLE ${sql(table)} IN ACCESS EXCLUSIVE MODE`,
          orElse: () => Effect.void,
        });

        const [appliedIds, current] = yield* Effect.all([loadAppliedIds, loader]);

        if (new Set(current.map(([id]) => id)).size !== current.length) {
          return yield* new Migrator.MigrationError({
            kind: "Duplicates",
            message: "Found duplicate migration id's",
          });
        }

        const required: Array<WrappedMigration> = [];

        for (const resolved of current) {
          const [currentId, currentName, load] = resolved;
          if (appliedIds.has(currentId)) {
            continue;
          }

          // `load` is `Effect.succeed(<the migration effect>)` for our
          // `fromRecord` loader; the inner value is the `Effect.Effect<...>`
          // body of the migration. We yield once to extract it and then wrap
          // it through `wrapMigration` to escape the upstream `any`/`unknown`
          // error types in a single typed boundary.
          const innerEffect = (yield* load) as Effect.Effect<unknown, unknown, SqlClient.SqlClient>;
          required.push([
            currentId,
            currentName,
            wrapMigration(currentId, currentName, innerEffect),
          ] as const);
        }

        if (required.length > 0) {
          yield* pipe(
            insertMigrations(required.map(([id, name]) => [id, name] as const)),
            Effect.mapError((error): Migrator.MigrationError | SqlError =>
              error.reason._tag === "ConstraintError"
                ? new Migrator.MigrationError({
                    kind: "Locked",
                    message: "Migrations already running",
                  })
                : error,
            ),
          );
        }

        yield* Effect.forEach(
          required,
          ([id, name, effect]) =>
            Effect.logDebug(`Running migration`).pipe(
              Effect.flatMap(() => Effect.orDie(effect)),
              Effect.annotateLogs("migration_id", String(id)),
              Effect.annotateLogs("migration_name", name),
              Effect.withSpan(`Migrator ${id}_${name}`),
            ),
          { discard: true },
        );

        yield* Effect.logDebug(`Migrations complete`).pipe(
          Effect.annotateLogs("applied_count", String(appliedIds.size + required.length)),
        );

        return required.map(([id, name]) => [id, name] as const);
      });

      yield* ensureMigrationsTable;

      const completed = yield* pipe(
        sql.withTransaction(run),
        Effect.catchTag("MigrationError", (error) =>
          error.kind === "Locked"
            ? Effect.as(
                Effect.logDebug(error.message),
                [] as ReadonlyArray<readonly [id: number, name: string]>,
              )
            : Effect.fail(error),
        ),
      );

      return completed;
    });

/**
 * Migrator run function with set-difference semantics over the
 * `effect_sql_migrations` tracking table.
 */
const run = makeRunner();

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

/**
 * Run all pending migrations.
 *
 * Creates the migrations tracking table (effect_sql_migrations) if it doesn't exist,
 * then runs any registered migration whose id is not yet present in that table.
 *
 * Returns array of [id, name] tuples for migrations that were run.
 *
 * @returns Effect containing array of executed migrations
 */
export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  yield* Effect.log(
    toMigrationInclusive === undefined
      ? "Running all migrations..."
      : `Running migrations 1 through ${toMigrationInclusive}...`,
  );
  const executedMigrations = yield* run({ loader: makeMigrationLoader(toMigrationInclusive) });
  yield* Effect.log("Migrations ran successfully").pipe(
    Effect.annotateLogs({ migrations: executedMigrations.map(([id, name]) => `${id}_${name}`) }),
  );
  return executedMigrations;
});

/**
 * Layer that runs migrations when the layer is built.
 *
 * Use this to ensure migrations run before your application starts.
 * Migrations are run automatically - no separate script is needed.
 *
 * @example
 * ```typescript
 * import { MigrationsLive } from "@acme/db/Migrations"
 * import * as SqliteClient from "@acme/db/SqliteClient"
 *
 * // Migrations run automatically when SqliteClient is provided
 * const AppLayer = MigrationsLive.pipe(
 *   Layer.provideMerge(SqliteClient.layer({ filename: "database.sqlite" }))
 * )
 * ```
 */
export const MigrationsLive = Layer.effectDiscard(runMigrations());

/**
 * Internal export for tests: build a runner and apply it to a custom loader,
 * without going through the static `migrationEntries` registry. Tests use this
 * to verify set-difference semantics with synthetic loaders.
 */
export const __runWithLoaderForTesting = (loader: Migrator.Loader) => run({ loader });
