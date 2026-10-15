import type { WorldDraftRecord } from "./api";
import { protectedComparisonText } from "./protectedAuthoringText";
import {
  recordDescription,
  recordName,
  recordPayload,
} from "./worldAuthoringModel";
function recordIds(record: WorldDraftRecord, known: ReadonlySet<string>) {
  const ids = new Set(known);
  ids.add(record.sourceId);
  const identity = recordPayload(record).identity;
  if (
    identity &&
    typeof identity === "object" &&
    !Array.isArray(identity) &&
    "id" in identity &&
    typeof identity.id === "string"
  )
    ids.add(identity.id);
  return ids;
}
/** Display-only projections. Never use these as an editor's persisted initial value. */
export function visibleRecordName(
  record: WorldDraftRecord,
  fallback: string,
  known: ReadonlySet<string> = new Set(),
) {
  const name = recordName(record, fallback);
  return protectedComparisonText(name, recordIds(record, known))
    ? fallback
    : name;
}
export function visibleRecordDescription(
  record: WorldDraftRecord,
  known: ReadonlySet<string> = new Set(),
) {
  const description = recordDescription(record);
  return protectedComparisonText(description, recordIds(record, known))
    ? undefined
    : description;
}
