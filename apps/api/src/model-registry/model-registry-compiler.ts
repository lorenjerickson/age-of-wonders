import type {
  ModelElementRevision,
  ModelMigrationPlan,
  ModelSchemaRelease,
} from "@aow/common";
import {
  ModelSchema,
  ModelMigration,
  modelElementRevisionContentHash as revisionHash,
  modelSchemaReleaseContentHash as releaseHash,
  type ModelSchemaCompilationInput,
  type CompiledModelSchema,
} from "@aow/domain";
import { canonicalJsonHash } from "../domain/snapshot-manifest";
export { ModelRegistryCompilationError } from "@aow/domain";
export type {
  ModelSchemaCompilationInput,
  CompiledModelElement,
  CompiledModelSchema,
  ModelRegistryValidationIssue,
  ModelRegistryValidationResult,
  ModelMigrationValidationResult,
} from "@aow/domain";

// Hashing and persistence remain adapters; owners enforce the exact release policy.
export function modelElementRevisionContentHash(
  revision: ModelElementRevision,
): string {
  return revisionHash(revision, canonicalJsonHash);
}
export function modelSchemaReleaseContentHash(
  release: ModelSchemaRelease,
): string {
  return releaseHash(release, canonicalJsonHash);
}
export function validateModelSchemaCompilation(
  input: ModelSchemaCompilationInput,
) {
  const owner = ModelSchema.deserializePayload(input, {
    contentHash: canonicalJsonHash,
  });
  try {
    return owner.compilationValidation();
  } finally {
    owner.dispose();
  }
}
export function compileModelSchemaRelease(
  input: ModelSchemaCompilationInput,
): CompiledModelSchema {
  const owner = ModelSchema.deserializePayload(input, {
    contentHash: canonicalJsonHash,
  });
  try {
    return owner.compile();
  } finally {
    owner.dispose();
  }
}
export async function publishModelSchemaRelease(
  input: ModelSchemaCompilationInput,
): Promise<CompiledModelSchema> {
  const owner = ModelSchema.deserializePayload(input, {
    contentHash: canonicalJsonHash,
  });
  try {
    const receipt = await owner.command("publish", {
      initiator: input.release.publishedByUserId,
      params: {},
      context: {},
    });
    if (receipt.status !== "committed" && receipt.status !== "unchanged")
      throw new TypeError(receipt.reason ?? "Model publication failed.");
    return owner.serializePayload().compiled!;
  } finally {
    owner.dispose();
  }
}
export function validateModelMigrationPlan(
  plan: ModelMigrationPlan,
  source: CompiledModelSchema,
  target: CompiledModelSchema,
) {
  const owner = ModelMigration.deserializePayload({ plan, source, target });
  try {
    return owner.migrationValidation();
  } finally {
    owner.dispose();
  }
}
