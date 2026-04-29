/**
 * ProjectionTagRepository - Projection repository interface for tags.
 *
 * Owns persistence operations for tag rows in the orchestration projection
 * read model.
 *
 * @module ProjectionTagRepository
 */
import { IsoDateTime, TagId } from "@t3tools/contracts";
import { Option, Schema, Context } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionTag = Schema.Struct({
  tagId: TagId,
  name: Schema.String,
  nameNormalized: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectionTag = typeof ProjectionTag.Type;

export const GetProjectionTagInput = Schema.Struct({
  tagId: TagId,
});
export type GetProjectionTagInput = typeof GetProjectionTagInput.Type;

export const GetProjectionTagByNormalizedNameInput = Schema.Struct({
  nameNormalized: Schema.String,
});
export type GetProjectionTagByNormalizedNameInput =
  typeof GetProjectionTagByNormalizedNameInput.Type;

export const DeleteProjectionTagInput = Schema.Struct({
  tagId: TagId,
});
export type DeleteProjectionTagInput = typeof DeleteProjectionTagInput.Type;

/**
 * ProjectionTagRepositoryShape - Service API for projected tag records.
 */
export interface ProjectionTagRepositoryShape {
  /**
   * Insert or replace a projected tag row.
   */
  readonly upsert: (row: ProjectionTag) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Read a projected tag row by id.
   */
  readonly getById: (
    input: GetProjectionTagInput,
  ) => Effect.Effect<Option.Option<ProjectionTag>, ProjectionRepositoryError>;

  /**
   * Read a projected tag row by its normalized (case-folded) name.
   */
  readonly getByNormalizedName: (
    input: GetProjectionTagByNormalizedNameInput,
  ) => Effect.Effect<Option.Option<ProjectionTag>, ProjectionRepositoryError>;

  /**
   * List all projected tag rows in deterministic creation order.
   */
  readonly listAll: () => Effect.Effect<ReadonlyArray<ProjectionTag>, ProjectionRepositoryError>;

  /**
   * Delete a projected tag row by id.
   */
  readonly deleteById: (
    input: DeleteProjectionTagInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

/**
 * ProjectionTagRepository - Service tag for tag projection persistence.
 */
export class ProjectionTagRepository extends Context.Service<
  ProjectionTagRepository,
  ProjectionTagRepositoryShape
>()("t3/persistence/Services/ProjectionTags/ProjectionTagRepository") {}
