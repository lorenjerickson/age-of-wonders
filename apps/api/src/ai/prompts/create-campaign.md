# Propose a Campaign Definition draft

Create an editable Campaign Definition draft proposal against the supplied immutable captured World
catalogs. The result is reusable authored preparation for a GM, not play state and not a script for
the players.

## Boundaries

- Use only Location, Creature, Item, and World Placement identifiers supplied in the captured World
  catalogs. Never invent or infer an identifier and never target a mutable or latest World head.
- Author Plots, including useful subplots. A Campaign may have multiple root Plots and subplots may
  nest recursively. Parent, prerequisite, and dependency references use the local Plot `key` values
  in this proposal. Relationships should normally point upward to an ancestor and must be acyclic.
- Objectives, Pressures, Resistances, and Discoveries organize GM intent and circumstances; they do
  not prescribe player actions or automatically trigger outcomes.
- Campaign placements are overlays. An `independent` placement places captured World content for one
  or more Plots. A `world-decoration` adds Campaign-specific meaning to a supplied World Placement.
  Neither changes the captured World or its placement.
- Objects, Traps, and Hazards are Item families and use `world-item`; do not create separate object or
  hazard placement kinds.
- Do not include Sessions, players, spectators, Agents, attendance, event logs, runtime actors,
  mutable inventory, Plot progress, or other Campaign Instance state.

## Rich text

Return `gmPremise` and `playerIntroduction` as restrained semantic HTML using only `p`, `h2`, `h3`,
`strong`, `em`, `ul`, `ol`, `li`, and `blockquote`. Do not use Markdown, inline styles, images,
scripts, or links.

## Output contract

Return exactly one JSON object shaped like this:

```json
{
  "name": "Campaign Definition name",
  "description": "Short library description",
  "gmPremise": "<p>Protected GM context.</p>",
  "playerIntroduction": "<p>Player-safe introduction.</p>",
  "partyStartingLocationId": "an ID from the captured Location catalog",
  "plots": [
    {
      "key": "local-stable-key",
      "name": "Root Plot name",
      "description": "GM-facing circumstances",
      "objectives": [{ "name": "Objective", "description": "Optional detail" }],
      "pressures": [{ "name": "Pressure", "description": "Optional detail" }],
      "resistances": [{ "name": "Resistance", "description": "Optional detail" }],
      "discoveries": [
        {
          "name": "What may be learned",
          "claims": [
            { "key": "claim-truth", "kind": "truth", "statement": "An authoritative truth." },
            {
              "key": "claim-rumor",
              "kind": "rumor",
              "statement": "A possibly false rumor.",
              "conflictsWithKeys": ["claim-truth"]
            }
          ]
        }
      ],
      "locationIds": ["captured Location ID"],
      "prerequisites": [],
      "dependencies": []
    },
    {
      "key": "subplot-key",
      "parentKey": "local-stable-key",
      "name": "Nested subplot",
      "objectives": [],
      "pressures": [],
      "resistances": [],
      "discoveries": [],
      "locationIds": [],
      "prerequisites": ["local-stable-key"],
      "dependencies": []
    }
  ],
  "placements": [
    {
      "kind": "independent",
      "name": "Campaign placement name",
      "locationId": "captured Location ID",
      "plotKeys": ["local-stable-key"],
      "source": {
        "kind": "world-creature",
        "creatureId": "captured Creature ID"
      },
      "notes": "Campaign-only behavior or presentation"
    },
    {
      "kind": "independent",
      "locationId": "captured Location ID",
      "plotKeys": ["subplot-key"],
      "source": {
        "kind": "world-item",
        "itemDefinitionId": "captured Item Definition ID"
      }
    },
    {
      "kind": "world-decoration",
      "name": "Campaign meaning added to an existing placement",
      "locationId": "the World Placement's captured Location ID",
      "plotKeys": ["local-stable-key", "subplot-key"],
      "capturedWorldPlacementId": "captured World Placement ID",
      "notes": "Campaign-only decoration"
    }
  ]
}
```

Provide at least one Plot. Arrays of placements and Plot details may be empty when the captured World
does not provide suitable content. Do not include commentary outside the JSON object.
