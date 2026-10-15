import { CampaignDefinition, isSafeCampaignRichText } from "@aow/domain";
import type { CanonicalSnapshotManifest } from "../domain/snapshot-manifest";
export { isSafeCampaignRichText };
export type {
  CampaignDraftRecord,
  CampaignDraftValidationIssue,
  CampaignDraftValidationReport,
} from "@aow/domain";
import type { CampaignDraftRecord } from "@aow/domain";

/** Integrity/authorization is checked by the caller; Campaign owns content policy. */
export function validateCampaignDefinitionDraft(
  campaignDefinitionId: string,
  content: unknown,
  records: readonly CampaignDraftRecord[],
  capturedWorld: CanonicalSnapshotManifest,
) {
  return CampaignDefinition.validateContent(
    campaignDefinitionId,
    content,
    records,
    capturedWorld,
  );
}
