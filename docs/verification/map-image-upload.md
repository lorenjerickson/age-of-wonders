# Location map replacement — 2026-10-14

Status: complete. The uploaded replacement objects contained zero bytes; the user
confirmed the selected local files were empty. Upload previously returned success,
then browser image decoding failed before replacing the editor's current image.
The valid prior image consequently remained in the save payload.

Both Location editors now reject empty files before upload, retain the existing map,
and display the error next to the image controls. The Atlas upload input resets so
the same filename can be retried. Object storage also rejects empty uploads and
removes the empty object before metadata can be created. Existing empty media is
not deleted or silently substituted.

Real-browser verification additionally found that the standalone Map route sent
its controls to a toolbar portal absent from the Astra layout. That route now uses
inline tools, matching the Atlas Map route, restoring upload and save controls.

## Evidence

- The real API authoring regression suite passed 83 service tests, including image
  replacement/readback with private fields and grid preservation.
- Storage/media tests passed six cases; empty objects are cleaned up. An actual
  empty multipart request through the web proxy returned 400 with no metadata row.
- Authenticated disposable PostgreSQL/MinIO acceptance passed PNG replacement and
  same-filename 2.6 MB WebP replacement. Desktop Atlas and mobile standalone Map
  previews displayed the new image, save/readback/reload retained it, and downloaded
  bytes matched the source SHA-256. No browser page errors occurred.
- Both editor component browser fixtures passed at 1440 and 390 px: empty-file
  rejection without an upload request, retry, prior-map preservation, and upload,
  library and generated-image preview/save/reload contracts. Generated responses
  were mocked; no paid generation was performed.
- Targeted web lint passed. No domain schema or AI-generation contract changed in
  this repair. Backend Architect, Frontend Developer and Code Reviewer guidance
  informed diagnosis and independent boundary checks.

Normal development data was inspected read-only. The disposable database, bucket
and servers were retained temporarily for B09 acceptance and cleaned up there.

## Measurement

Active interval: 8.34 minutes. Verification totaled 205.42 command-seconds with
173.06 seconds of overlapping-interval union (34.60% of that interval). B09 started
during final map-fix verification, so these batch wall intervals overlap.

Tests: 17.47 seconds; browser: 182.44 seconds; lint: 5.51 seconds. Eight browser
reruns addressed sandbox listening permission, a transient Node readiness-fetch
error, an accessible-name selector, hydration and guessed route errors, and the
genuine missing standalone controls. Final checks followed changed feedback layout.
Seven failed browser attempts are retained in the raw log; these are not all product
regressions. Preparation and manual review were not individually timed and are not
estimated. Implementation continued during verification.

[Raw timings](map-image-upload-timings.jsonl) and
[measurement receipt](map-image-upload-measurement.json).
