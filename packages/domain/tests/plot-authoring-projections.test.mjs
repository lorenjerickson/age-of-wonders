import assert from "node:assert/strict";
import test from "node:test";
import { PlotDefinition } from "../dist/index.js";
const plot = (id, parent, extra = {}) => ({
  resourceType: "plots",
  sourceId: id,
  payload: {
    id,
    parent: parent
      ? { kind: "subplot", parentPlotDefinitionId: parent }
      : { kind: "root" },
    ...extra,
  },
});
const placement = (id, locationId, plots) => ({
  resourceType: "campaign-placements",
  sourceId: id,
  payload: { locationId, plotDefinitionIds: plots, private: { secret: true } },
});
test("Plot parent candidates exclude self/descendants and cycle traversal terminates without mutating capture", () => {
  const records = [
    plot("root"),
    plot("child", "root"),
    plot("grandchild", "child"),
    plot("other"),
  ];
  const before = structuredClone(records);
  assert.deepEqual(
    PlotDefinition.authoringParentCandidates(records, "child").map(
      (record) => record.sourceId,
    ),
    ["root", "other"],
  );
  assert.deepEqual(
    [
      ...PlotDefinition.authoringDescendantIds(
        [plot("a", "b"), plot("b", "a")],
        "a",
      ),
    ],
    ["b", "a"],
  );
  assert.deepEqual(records, before);
});
test("Plot Location associations require both matching Location and reciprocal Plot membership", () => {
  const records = [
    placement("yes", "harbor", ["plot"]),
    placement("other-location", "forest", ["plot"]),
    placement("other-plot", "harbor", ["other"]),
  ];
  const before = structuredClone(records);
  assert.deepEqual(
    PlotDefinition.authoringContextPlacements(records, "plot", "harbor").map(
      (record) => record.sourceId,
    ),
    ["yes"],
  );
  assert.equal(
    PlotDefinition.authoringContextAssociationsValid(
      ["yes"],
      records,
      "plot",
      "harbor",
    ),
    true,
  );
  assert.equal(
    PlotDefinition.authoringContextAssociationsValid(
      ["other-location"],
      records,
      "plot",
      "harbor",
    ),
    false,
  );
  assert.deepEqual(records, before);
});
test("Plot removal separately explains child, relationship and placement references", () => {
  assert.match(
    PlotDefinition.authoringDeletionIssue(
      [plot("root"), plot("child", "root")],
      "root",
    ),
    /subplots/,
  );
  for (const field of ["prerequisites", "dependencies"])
    assert.match(
      PlotDefinition.authoringDeletionIssue(
        [
          plot("sibling", undefined, {
            [field]: [{ plotDefinitionId: "root", private: true }],
          }),
        ],
        "root",
      ),
      /associations/,
    );
  assert.match(
    PlotDefinition.authoringDeletionIssue(
      [placement("one", "harbor", ["root"])],
      "root",
    ),
    /associations/,
  );
  assert.equal(
    PlotDefinition.authoringDeletionIssue(
      [plot("root"), plot("other")],
      "root",
    ),
    undefined,
  );
});
test("Plot reparenting keeps cross-branch rationale policy and preserves relationship payload", () => {
  const records = [plot("root"), plot("child", "root"), plot("other")];
  const payload = {
    prerequisites: [{ plotDefinitionId: "root", private: { retained: true } }],
  };
  const before = structuredClone(payload);
  assert.equal(
    PlotDefinition.authoringParentChangeIssue(payload, records, "child"),
    undefined,
  );
  assert.match(
    PlotDefinition.authoringParentChangeIssue(payload, records, "other"),
    /cross-branch/,
  );
  assert.equal(
    PlotDefinition.authoringParentChangeIssue(
      {
        prerequisites: [
          {
            ...payload.prerequisites[0],
            crossBranchRationale: "Across the valley",
          },
        ],
      },
      records,
      "other",
    ),
    undefined,
  );
  assert.deepEqual(payload, before);
});
