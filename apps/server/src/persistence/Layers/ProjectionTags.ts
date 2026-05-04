import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionTagInput,
  GetProjectionTagByNormalizedNameInput,
  GetProjectionTagInput,
  ProjectionTag,
  ProjectionTagRepository,
  type ProjectionTagRepositoryShape,
} from "../Services/ProjectionTags.ts";

const makeProjectionTagRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionTagRow = SqlSchema.void({
    Request: ProjectionTag,
    execute: (row) =>
      sql`
        INSERT INTO projection_tags (
          tag_id,
          name,
          name_normalized,
          created_at,
          updated_at
        )
        VALUES (
          ${row.tagId},
          ${row.name},
          ${row.nameNormalized},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (tag_id)
        DO UPDATE SET
          name = excluded.name,
          name_normalized = excluded.name_normalized,
          updated_at = excluded.updated_at
      `,
  });

  const getProjectionTagRow = SqlSchema.findOneOption({
    Request: GetProjectionTagInput,
    Result: ProjectionTag,
    execute: ({ tagId }) =>
      sql`
        SELECT
          tag_id AS "tagId",
          name,
          name_normalized AS "nameNormalized",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_tags
        WHERE tag_id = ${tagId}
      `,
  });

  const getProjectionTagByNormalizedNameRow = SqlSchema.findOneOption({
    Request: GetProjectionTagByNormalizedNameInput,
    Result: ProjectionTag,
    execute: ({ nameNormalized }) =>
      sql`
        SELECT
          tag_id AS "tagId",
          name,
          name_normalized AS "nameNormalized",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_tags
        WHERE name_normalized = ${nameNormalized}
        LIMIT 1
      `,
  });

  const listProjectionTagRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionTag,
    execute: () =>
      sql`
        SELECT
          tag_id AS "tagId",
          name,
          name_normalized AS "nameNormalized",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_tags
        ORDER BY created_at ASC, tag_id ASC
      `,
  });

  const deleteProjectionTagRow = SqlSchema.void({
    Request: DeleteProjectionTagInput,
    execute: ({ tagId }) =>
      sql`
        DELETE FROM projection_tags
        WHERE tag_id = ${tagId}
      `,
  });

  const upsert: ProjectionTagRepositoryShape["upsert"] = (row) =>
    upsertProjectionTagRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTagRepository.upsert:query")),
    );

  const getById: ProjectionTagRepositoryShape["getById"] = (input) =>
    getProjectionTagRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTagRepository.getById:query")),
    );

  const getByNormalizedName: ProjectionTagRepositoryShape["getByNormalizedName"] = (input) =>
    getProjectionTagByNormalizedNameRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTagRepository.getByNormalizedName:query")),
    );

  const listAll: ProjectionTagRepositoryShape["listAll"] = () =>
    listProjectionTagRows().pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTagRepository.listAll:query")),
    );

  const deleteById: ProjectionTagRepositoryShape["deleteById"] = (input) =>
    deleteProjectionTagRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionTagRepository.deleteById:query")),
    );

  return {
    upsert,
    getById,
    getByNormalizedName,
    listAll,
    deleteById,
  } satisfies ProjectionTagRepositoryShape;
});

export const ProjectionTagRepositoryLive = Layer.effect(
  ProjectionTagRepository,
  makeProjectionTagRepository,
);
