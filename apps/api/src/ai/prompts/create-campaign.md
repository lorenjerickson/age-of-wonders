# Create a campaign foundation

Create a compelling, immediately usable campaign foundation for the selected world. The result is
an editable starting point for a GM, not a script for the party.

## Creative goals

- Give the campaign a memorable, specific name.
- Write a rich GM premise that explains the starting situation, important tensions, notable people,
  and protected context. Give the GM useful material without dictating solutions.
- Write a separate player introduction that is safe to share at session zero. It should be
  evocative, concise, and free of protected GM information.
- Select one valid starting location from the supplied world-location catalog.
- Include the supplied world-location hierarchy. The singleton campaign can author and play in every
  location; `locationIds` is a materialized hierarchy, not a separate campaign scope.
- When useful world creatures or items are available, propose a small number of persistent
  placements at valid locations. Placement never implies combat or a required interaction, and it
  remains present across session boundaries until the GM changes it or resets the world.
- Author three to six location discoveries. Give each a clear GM-facing name and useful grants.
  Prefer rumors, facts, and general knowledge. Item grants may reference only supplied item
  definitions. Do not invent identifiers.
- Never prescribe what the party must do, list approved actions, create a story arc, define an
  objective, or predict an outcome.

## Rich text

Return `gmPremise` and `playerIntroduction` as restrained semantic HTML using only `p`, `h2`, `h3`,
`strong`, `em`, `ul`, `ol`, `li`, and `blockquote`. Do not use Markdown, inline styles, images,
scripts, or links.

## Output contract

Return exactly one JSON object with this shape:

```json
{
  "name": "Campaign name",
  "gmPremise": "<p>Protected GM context.</p>",
  "playerIntroduction": "<p>Player-safe introduction.</p>",
  "locationIds": ["all IDs from the supplied world-location catalog"],
  "partyStartingLocationId": "an ID from the location catalog",
  "creaturePlacements": [
    {
      "creatureId": "an ID from the creature catalog",
      "locationId": "an ID from the location catalog"
    }
  ],
  "itemPlacements": [
    {
      "itemDefinitionId": "an ID from the item catalog",
      "locationId": "an ID from the location catalog"
    }
  ],
  "locationCanvases": [],
  "discoveries": [
    {
      "name": "GM-facing discovery name",
      "locationId": "an ID from the location catalog",
      "grants": [
        { "kind": "rumor", "text": "A concise rumor." },
        { "kind": "fact", "text": "A concise fact." },
        { "kind": "general-knowledge", "text": "Useful knowledge." },
        { "kind": "money", "value": { "amount": 25, "denomination": "gp" } },
        { "kind": "item", "itemDefinitionId": "an ID from the item catalog" }
      ]
    }
  ]
}
```

Arrays may be empty when the supplied world has no suitable content. Do not include IDs outside the
provided catalogs. Leave `locationCanvases` empty; the GM configures that persistent presentation
state in the location workspace. Do not include commentary outside the JSON object.
