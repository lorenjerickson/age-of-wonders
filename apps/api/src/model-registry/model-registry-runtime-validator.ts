import { BadRequestException } from "@nestjs/common";
import { ModelElement, ModelMigration } from "@aow/domain";
import { isPublicationJson } from "../domain/snapshot-manifest";

export function assertModelElementRuntimeShape(value: unknown): void {
  const issues = ModelElement.authoringShapeIssues(value, isPublicationJson);
  if (issues.length)
    throw new BadRequestException({
      message: "The Model Element shape is invalid.",
      issues: issues.map((detail) => ({
        code: "model-shape-invalid",
        subject: "Model Element",
        detail,
      })),
    });
}
export function assertModelMigrationMappingsRuntimeShape(value: unknown): void {
  const issues = ModelMigration.mappingShapeIssues(value, isPublicationJson);
  if (issues.length)
    throw new BadRequestException({
      message: "The Model migration mapping shape is invalid.",
      issues: issues.map((detail) => ({
        code: "model-migration-shape-invalid",
        subject: "Model migration",
        detail,
      })),
    });
}
