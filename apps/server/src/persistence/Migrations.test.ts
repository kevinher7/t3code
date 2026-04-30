/**
 * Migration registry-shape invariants. These tests are pure (no DB) and
 * enforce the banded-id convention introduced alongside the set-difference
 * runner: upstream ids occupy `1..999`, downstream-only ids occupy `>= 5000`.
 */

import { describe, expect, it } from "vitest";

import { migrationEntries } from "./Migrations.ts";

const UPSTREAM_BAND_MIN = 1;
const UPSTREAM_BAND_MAX = 999;
const DOWNSTREAM_BAND_MIN = 5000;

describe("migrationEntries", () => {
  it("has no duplicate migration ids", () => {
    const ids = migrationEntries.map(([id]) => id);
    expect(new Set(ids).size).toBe(migrationEntries.length);
  });

  it("respects banded id ranges (upstream 1..999, downstream >= 5000)", () => {
    for (const [id, name] of migrationEntries) {
      const inUpstream = id >= UPSTREAM_BAND_MIN && id <= UPSTREAM_BAND_MAX;
      const inDownstream = id >= DOWNSTREAM_BAND_MIN;
      expect(
        inUpstream || inDownstream,
        `Migration ${id}_${name} is in the forbidden gap between upstream (1..${UPSTREAM_BAND_MAX}) and downstream (>= ${DOWNSTREAM_BAND_MIN})`,
      ).toBe(true);
    }
  });
});
