# Age of Wonders domain model

This document is the AI-facing serialization guide for the domain model implemented in
`packages/common/src/types`. The TypeScript source remains authoritative. Generate JSON that
matches these structures exactly: omit optional properties when they are unknown, include every
required property, use the documented discriminant values, and never add explanatory prose around
a requested JSON payload.

There is no magic in the authoritative game system. Every apparently supernatural event is a
physical phenomenon, biological capability, scientific process, or technology, even when people
in the setting misunderstand it. Folkloric terms may appear in names, aliases, beliefs, and quoted
descriptions, but never as authoritative mechanical causation.

## Model conventions

### Definitions and state

The model separates reusable rules content from mutable play state.

- A **definition** describes reusable rules or authored content. Definitions use the common
  `Definition` envelope and are referenced by `DefinitionId`.
- A **state aggregate** describes one mutable thing in a game. Most state aggregates use
  `StateIdentity` and reference definitions rather than copying them.
- A **game state** is an authoritative snapshot that composes a campaign, its entities, geography,
  encounter state, decisions, executions, events, and deterministic random state.

Do not embed a definition where an `...Id` property is expected. Do not use a runtime entity ID as
a definition ID. IDs are serialized as strings even though TypeScript brands them by purpose.

### Common JSON shapes

```ts
type NamespacedKey = `${string}:${string}`;
type RulesEdition = "2014" | "2024" | `homebrew:${string}`;

interface VersionedState {
  revision: number;
  updatedAt: string; // ISO-8601 timestamp
}

interface StateIdentity {
  id: string;
  version: VersionedState;
}

interface RulesSource {
  namespace: string;
  edition: RulesEdition;
  book?: string;
  page?: number;
  url?: string;
  license?: "CC-BY-4.0" | "OGL-1.0a" | "proprietary" | "private" | string;
}

interface DefinitionIdentity {
  id: string;
  key: NamespacedKey;
  name: string;
  description?: string;
  source: RulesSource;
  tags?: string[];
}

interface Definition {
  identity: DefinitionIdentity;
  kind: string;
  components: object;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

All `extensions` objects must use namespaced keys such as `aow:session-zero`. Extension values must
be JSON values. Standard open-string fields accept their documented values and may accept a custom
string; prefer a namespaced custom value where ambiguity is possible.

Other shared values include:

- `Distance`: `{ "value": number, "unit": "foot" | "mile" | "square" | "hex" | "meter" | "kilometer" }`
- `Weight`: `{ "value": number, "unit": "pound" | "ounce" | "kilogram" }`
- `Duration`: `{ "kind": "instantaneous" }`, `{ "kind": "until-event", "event": string }`,
  `{ "kind": "permanent", "neutralizable"?: boolean }`,
  `{ "kind": "measured", "amount": number, "unit": "turn" | "round" | "minute" | "hour" | "day" | "week" | "month" | "year" }`,
  or `{ "kind": "special", "description": string }`.
- `ResourcePool`: `{ "current": number, "maximum": number, "temporary"?: number }`.
- `AttributeCollection<T>`: `{ "standard": { ...standard attributes }, "custom"?: { [namespacedKey]: T } }`.
  Standard attributes are `might`, `intellect`, `will`, `hardiness`, `charisma`, `agility`,
  `fortune`, and `sanity`. `AttributeScore` is always an integer from 0 through 100; approximately
  50 represents an ordinary adult. It is not a D&D-style 3-through-18 score. The neutral default for
  every standard attribute is 50.

## Persisted API resources

The generic domain API persists these resources. The identifier used by the API is derived as shown.

| Resource               | Aggregate                 | Stored ID              | Stored kind/name                                |
| ---------------------- | ------------------------- | ---------------------- | ----------------------------------------------- |
| `definitions`          | `GameDefinition`          | `identity.id`          | `kind`, `identity.name`                         |
| `rule-variants`        | `RuleVariant`             | `id`                   | `rule-variant`, `name`                          |
| `content-packs`        | `ContentPackManifest`     | `id`                   | `content-pack`, `name`                          |
| `extension-schemas`    | `ExtensionSchema`         | `id`                   | `extension-schema`, `key`                       |
| `systems`              | `GameSystemDefinition`    | `id`                   | `game-system`, `name`                           |
| `games`                | `GameState`               | `campaign.identity.id` | `game-state`, campaign name                     |
| `campaigns`            | `CampaignState`           | `identity.id`          | name                                            |
| `sessions`             | `SessionState`            | `identity.id`          | name                                            |
| `characters`           | `CharacterState`          | `identity.id`          | name                                            |
| `creatures`            | `CreatureState`           | `identity.id`          | name                                            |
| `items`                | `ItemInstance`            | `id`                   | `item-instance`, name override or definition ID |
| `objects`              | `ObjectState`             | `identity.id`          | name                                            |
| `scenes`               | `SceneState`              | `identity.id`          | name                                            |
| `locations`            | `LocationState`           | `identity.id`          | `kind`, name                                    |
| `location-connections` | `LocationConnectionState` | `identity.id`          | `kind`                                          |
| `encounters`           | `EncounterState`          | `identity.id`          | name                                            |
| `pending-decisions`    | `PendingDecision`         | `id`                   | `pending-decision`                              |
| `game-events`          | `GameEvent`               | `id`                   | `type`                                          |

Fields ending in `Id` or `Ids` become graph relationships automatically. Keep references in those
fields rather than inventing parallel reference structures.

World-authored item definitions are stored in `definitions` with `kind: "item"` and the owning
world ID in `extensions["aow:worldId"]`. Item instances use the same extension when created by a
world-scoped workflow. Supplying `worldId` while listing either resource filters on that extension;
other world-owned aggregates use their top-level `worldId` field. Removing a root world removes
these world-scoped item instances and definitions along with its creatures and location hierarchy.

Legacy stored aggregates are temporarily normalized by the science-domain compatibility reader.
The versioned persistence migration rewrites changed aggregates with optimistic revision increments
and replaces their derived graph projections. This compatibility behavior is for old records only;
AI output must always use the current contracts in this guide.

Portable domain snapshots use the versioned `aow:science-domain-archive` envelope. Each record
contains a resource category and one complete aggregate. Archive creation and reading apply the
same compatibility migration, reject duplicate canonical identities, and emit human-readable
exception reports without exposing internal identifiers. Persistence-facing CLI commands export a
new archive without overwriting an existing backup and import it as a dry-run-by-default merge.
Apply mode uses optimistic aggregate replacement and rebuilds every imported graph projection.
Ordinary create and replace operations reject legacy contracts; only the explicit migration and
archive workflows may normalize legacy data.

Complete host transfers use the separate versioned `aow:host-transfer-archive` format. Its
compressed artifact preserves full selected `DomainRecord` rows (including revisions and
timestamps), every `MediaAsset` row, every object-storage byte under its original key, checksums,
and the exact Prisma schema required by the exported data. World, campaign, and session selectors
include owned records, location descendants, and referenced dependencies. Import is one complete
operation, supports `ours`, `theirs`, and `both` conflict strategies, and can declaratively upgrade
an empty or older destination database from the bundled schema before applying data.

### SessionState

`SessionState` is the persisted campaign-session aggregate. It has `identity`, a human-readable
`name`, required `worldId` and `campaignId`, a `status` of `planned`, `in-progress`, `completed`, or
`cancelled`, optional ISO timestamps (`scheduledFor`, `startedAt`, and `endedAt`), and arrays of
`sceneIds`, `encounterIds`, and `eventIds`. Optional `notes` and namespaced `extensions` hold session
material that does not yet have a first-class field. These references make selective host transfer
include the session's required campaign and play-state dependencies.

## Geography and world-building

Geography is normalized. Every world, plane, continent, ocean, region, nation, province, territory,
wilderness, settlement, district, and site is its own `LocationState`. Parentage is expressed by
`placement`; direct travel or adjacency is expressed by `LocationConnectionState`. Do not nest child
location aggregates inside a parent `LocationState`.

### LocationState

```ts
interface LocationState {
  identity: StateIdentity;
  name: string;
  description?: string;
  kind:
    | "world"
    | "plane"
    | "continent"
    | "ocean"
    | "region"
    | "nation"
    | "province"
    | "territory"
    | "wilderness"
    | "settlement"
    | "district"
    | "site"
    | string;
  placement: LocationPlacement;
  image: LocationImage;
  profile: LocationProfile;
  sceneIds: string[];
  pointOfInterestIds?: string[];
  discoveredBy?: string[];
  physicalEnvironment?: PhysicalEnvironment;
  extensions?: Record<NamespacedKey, JsonValue>;
}

interface PhysicalEnvironment {
  kind:
    | "planetary-region"
    | "extradimensional-region"
    | "artificial-habitat"
    | "isolated-habitat"
    | "simulation"
    | "field-contained-region"
    | "unknown"
    | string;
  understanding: UnderstandingState;
  observedProperties: [string, ...string[]];
  operatingBasis?: OperatingBasis;
  mechanismDescription?: string;
  sustainingInfrastructure?: string[];
  boundaryConditions?: string[];
  accessConstraints?: string[];
  provenance?: string;
}

type LocationPlacement =
  | { kind: "root" }
  | { kind: "within-parent"; parentLocationId: string; border: LocationBorder };

interface LocationImage {
  assetId: string;
  uri?: string;
  altText: string;
  width: number;
  height: number;
  mimeType: `image/${string}`;
  focalPoint?: { kind: "normalized-map"; x: number; y: number };
}

interface LocationProfile {
  terrain: {
    aspect: LocationAspectSummary;
    terrainTypes: string[];
    climates?: string[];
    elevationRange?: [number, number];
    waterways?: string[];
    naturalResourceTags?: string[];
    hazardDefinitionIds?: string[];
    travelModifiers?: RuleModifier[];
  };
  culture: {
    aspect: LocationAspectSummary;
    cultures: Array<{
      cultureId: string;
      prominence?: number;
      population?: number;
      settlementPattern?: string;
    }>;
    heritageCandidateIds: string[];
    languages: string[];
    population?: number;
    customs?: string[];
    religions?: string[];
  };
  politics: {
    aspect: LocationAspectSummary;
    governmentForms?: string[];
    influences: Array<{
      polityId: string;
      role:
        | "sovereign"
        | "administrator"
        | "claimant"
        | "occupier"
        | "influencer"
        | string;
      influence?: number;
    }>;
    relationships?: Array<{
      otherLocationId: string;
      relation:
        | "allied"
        | "friendly"
        | "neutral"
        | "tense"
        | "hostile"
        | "at-war"
        | string;
      since?: string;
      notes?: string;
    }>;
    stability?: number;
    laws?: string[];
  };
}

interface LocationAspectSummary {
  summary?: string;
  tags: string[];
  traitIds: string[];
}
```

Every location whose `kind` is `plane` requires `physicalEnvironment` and at least one measurable
or repeatably observed property. “Plane” may remain as a cultural or geographic label, but it does
not supply a supernatural explanation. Use `understanding: "unknown"` when the mechanism has not
been established; do not invent precision. Legacy plane records without this metadata migrate to
an explicit unknown environment and are registered as content-review exceptions.

`LocationBorder` identifies its coordinate space and contains either a polygon or multiple polygons.
Polygon rings contain at least three coordinates. Coordinates are one of:

- normalized map: `{ "kind": "normalized-map", "x": 0..1, "y": 0..1 }`
- geographic: `{ "kind": "geographic", "latitude": number, "longitude": number, "elevation"?: number }`
- custom: `{ "kind": "custom", "coordinateSystem": "namespace:key", "value": JsonValue }`

### LocationConnectionState

```ts
interface LocationConnectionState {
  identity: StateIdentity;
  scopeLocationId: string;
  fromLocationId: string;
  toLocationId: string;
  direction: "bidirectional" | "from-to-only" | "to-from-only";
  kind:
    | "shared-border"
    | "road"
    | "trail"
    | "river"
    | "sea-route"
    | "air-route"
    | "portal"
    | "passage"
    | string;
  status: "open" | "restricted" | "blocked" | "destroyed" | "unknown" | string;
  distance?: Distance;
  typicalDuration?: Duration;
  allowedMovementModes?: string[];
  prerequisites?: Predicate[];
  travelCheck?: {
    interval?: Duration;
    encounterRoll?: DiceExpression;
    difficulty?: NumericExpression;
  };
  mechanism?: {
    operatingBasis: OperatingBasis;
    understanding: UnderstandingState;
    observedOperation: string;
    mechanismDescription?: string;
    infrastructure?: string[];
    activationRequirements?: string[];
    failureModes?: string[];
  };
  notes?: string;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

`mechanism` is required for `portal` connections and any edge whose traversal is not ordinary
locomotion. A legacy portal without enough information uses an `unknown` basis and understanding
only while carrying an explicit science-refactor exception; new records must describe the observed
operation and known physical implementation honestly.

`LocationGraphState` contains `version`, `rootLocationIds`, a flat `locations` array, and a flat
`connections` array. It is composed into `GameState.entities.geography`; it is not itself a generic
domain API resource.

### AI location-generation output

The `POST /api/ai/worlds` workflow accepts exactly one JSON object, parses it as the root
`LocationState`, forces `kind` to `world`, generates and stores its map, and persists it under the
`locations` resource. Return the root world only: no Markdown fence, prose, array,
`{ "world": ... }` wrapper, or full `LocationGraphState` wrapper. The API replaces generated
identity and image-storage metadata with authoritative values before persistence. Include a
two-sentence `description` suitable for the dashboard.

The `POST /api/ai/locations/:parentId` workflow combines `create-location.md`, this document, the
complete parent location record, and user context. It accepts one child `LocationState`, forces a
new identity and a `within-parent` placement referencing the route parent, generates and stores its
map, and then persists it. Never copy the parent's ID or emit nested child aggregates. Both workflows
use `extensions["aow:map-brief"].imageGenerationPrompt` as the production image prompt.

Use namespaced extension data for generation-only artifacts that do not yet have first-class domain
fields. In particular, a session-zero brief may be stored at `extensions["aow:session-zero"]`. A
planned child-location outline may be stored at `extensions["aow:location-outline"]`, but it does not
replace separately persisted child `LocationState` records. Generated and uploaded maps are stored
as media assets; `image.assetId` identifies that asset, while a short-lived signed URL is resolved
when displayed. Do not fabricate or persist a signed `image.uri`.

Minimal structurally complete root-world example:

```json
{
  "identity": {
    "id": "8dd65d5f-f943-4d86-a2b4-bf6769d4975a",
    "version": { "revision": 1, "updatedAt": "2026-08-20T20:00:00.000Z" }
  },
  "name": "The Shattered Meridian",
  "description": "The Shattered Meridian is an ocean world whose migrating islands follow the passage of three moons. Rival navigators race to control the one route that may lead beyond the celestial storm wall.",
  "kind": "world",
  "placement": { "kind": "root" },
  "image": {
    "assetId": "2daf3824-2a95-4d3c-86f2-9df88f14f737",
    "altText": "A painted map of migrating islands beneath three moons",
    "width": 2048,
    "height": 2048,
    "mimeType": "image/webp"
  },
  "profile": {
    "terrain": {
      "aspect": {
        "summary": "A moon-driven ocean of moving archipelagos.",
        "tags": ["oceanic", "migratory-islands"],
        "traitIds": []
      },
      "terrainTypes": ["open ocean", "volcanic archipelago"],
      "climates": ["tropical", "storm belt"],
      "waterways": ["The Meridian Current"]
    },
    "culture": {
      "aspect": {
        "summary": "Navigation defines status, faith, and survival.",
        "tags": ["seafaring", "lunar"],
        "traitIds": []
      },
      "cultures": [],
      "heritageCandidateIds": [],
      "languages": ["Meridian Trade Speech"]
    },
    "politics": {
      "aspect": {
        "summary": "Chart-houses compete for routes and safe harbor.",
        "tags": ["mercantile", "competitive"],
        "traitIds": []
      },
      "governmentForms": ["independent chart-houses"],
      "influences": [],
      "stability": 52
    }
  },
  "sceneIds": [],
  "pointOfInterestIds": [],
  "discoveredBy": [],
  "extensions": {
    "aow:session-zero": {
      "tone": "adventurous maritime fantasy with looming cosmic danger",
      "themes": ["discovery", "community", "the cost of certainty"],
      "premise": "The characters possess a fragment of the only chart through the storm wall.",
      "primaryOpponent": "The Astral Cartographers",
      "safetyNotes": []
    },
    "aow:location-outline": [
      {
        "provisionalId": "region:glasswake",
        "name": "The Glasswake",
        "kind": "region",
        "summary": "A calm equatorial sea hiding drowned observatories."
      }
    ]
  }
}
```

## Campaign and world state

`CampaignState` contains `identity`, `name`, `currentTime`, optional `activeSceneId`, `sceneIds`,
`partyIds`, `partyLocations`, `rests`, optional active `travel`, `socialAttitudes`,
`downtimeActivities`, optional quests, `globalFlags`, and optional extensions. A quest has `id`,
`name`, status (`unknown`, `active`, `completed`, or `failed`), and objectives with `description` and
`completed`. `CalendarInstant` contains `calendarId`, year, month, day, hour, minute, and optional
round.

`SceneState` contains `identity`, `name`, optional strategic `locationId`, optional dimensions and
grid, `defaultLight`, `entityIds`, `objectIds`, `hazardIds`, optional traits, and extensions.

`ObjectState` contains `identity`, optional `definitionId`, `name`, optional defenses and hit points,
boolean locked/open/hidden state, optional encounter position and inventory, and extensions.

Travel references a flat route of `routeConnectionIds` between an origin and destination, tracks the
current location/connection, pace, remaining distance, travel hours, forced march, navigator, roles,
vehicle, lost state, and encounter checks. Party location is stored separately as a party ID,
location ID, and `stationary`, `traveling`, or `lost` status.

## Characters, creatures, items, and encounters

- `CharacterState` owns identity/entity references, controllers, advancement, heritage, background,
  alignment, classes, attributes, skills, proficiencies, defenses, hit points, movement, senses,
  languages, inventory/equipment, disciplines, features, feats, professions, effects, conditions,
  resource pools, biography, and extensions.
- `CreatureState` is the runtime monster/NPC counterpart. It includes an optional monster
  definition, three required image assets, an opposed-roll defense rating contributed by equipped
  armor, physical classification and local aliases, combat statistics, inventory/equipment,
  disciplines, communication capabilities, action definition IDs, effects, conditions, resources,
  damage adjustments, triggers, optional transformed form, disposition, and extensions.
- Every `ItemDefinition` has a required construction quality of `ramshackle`, `standard`, `fine`,
  or `exquisite`. `ItemInstance` references an item definition and records its own required quality,
  quantity, current location,
  attunement-as-operator-synchronization, analysis state, capacity/ammunition/durability, custom
  values, and extensions. Item
  location is discriminated as `inventory`, `container`, `scene`, `location`, `carried`, or
  `destroyed`.
- `EncounterState` contains identity/name, phase, round/turn, initiative, combatants, environment,
  pending rule executions, roll history, and extensions. Encounter position is scene-local and is
  not a substitute for strategic `LocationState` placement.

Character heritage records an origin region and zero to three immutable-at-creation heritage
selections. Character profession state records current expertise, how it was acquired, advancement
awards/spends, and action use counts.

Skills are definitions, never free-form strings in state or tests:

```ts
interface SkillComponents {
  defaultAttribute?: Attribute;
}

type SkillDefinition = Definition<"skill", SkillComponents>;

interface SkillState {
  skillDefinitionId: DefinitionId;
  attribute: Attribute;
  rank: "none" | "half" | "proficient" | "expertise" | "custom";
  bonus: number;
  passive: number;
}
```

Backgrounds use `skillProficiencyIds`. Tests and skill-bonus expressions use
`skillDefinitionId`. Never invent a skill definition ID; omit the optional skill from a test or use
an empty skill-state collection when the referenced definition is not supplied.

The built-in skill catalog uses stable IDs of the form `aow:skill-<key>`. Its keys are
`acrobatics`, `animal-handling`, `athletics`, `deception`, `history`, `insight`, `intimidation`,
`investigation`, `medicine`, `nature`, `perception`, `performance`, `persuasion`, `religion`,
`sleight-of-hand`, `stealth`, `survival`, `demolition`, `engineering`, `navigation`, `pilot`,
`science`, `streetwise`, `subterfuge`, `tactics`, `technology`, and `marksmanship`. Arcana is not a
built-in skill; migrated Arcana references resolve to `aow:skill-science`.

Creature taxonomy separates physical classification from cultural vocabulary:

```ts
interface CreatureClassification {
  nature:
    | "organism"
    | "engineered-organism"
    | "machine"
    | "composite"
    | "collective"
    | "field-phenomenon"
    | "unknown"
    | string;
  morphology?: string;
  formalName?: string;
  origin?: string;
  composition?: string[];
  aliases: {
    label: string;
    context?: string;
    language?: string;
    locationId?: string;
  }[];
}

interface CommunicationCapability {
  medium:
    | "acoustic"
    | "visual"
    | "chemical"
    | "radio"
    | "neural"
    | "field-effect"
    | "wired"
    | "unknown"
    | string;
  directionality: "one-way" | "bidirectional" | "broadcast";
  range?: Distance;
  operatingBasis: OperatingBasis;
  understanding: UnderstandingState;
  requirements?: string[];
  description?: string;
}
```

`CreatureState.classification` and `MonsterComponents.classification` are required. Terms such as
fiend, fey, celestial, undead, dragon, or monstrosity may be aliases but are not authoritative
physical categories. Creature state always has a `communicationCapabilities` array; monster
definitions may omit it. Never emit the legacy numeric `telepathy` field.

Senses use observed capabilities such as `normal`, `multispectral`, `field-detection`,
`material-penetration`, or `projection-discrimination`. Every extraordinary sense records its
`operatingBasis`, `understanding`, and optional `mechanismDescription`. `truesight` migrates to an
unresolved advanced-sensing exception rather than pretending several unrelated sensing mechanisms
are one universal capability.

Canonical conditions use `influenced` rather than `charmed` and `immobilized-transformed` rather
than `petrified`. Damage adjustments use a structured `bypassPredicate`. Compatibility migration
preserves old `bypassedBy` strings under `extensions["aow:legacy-bypass-labels"]` and registers the
record for review.

### Creature images

Every `CreatureState` requires an `images` object with exactly three gameplay views. The keyed
roles are semantic and must not be substituted for one another:

```ts
interface CreatureState {
  identity: StateIdentity;
  entityId: string;
  worldId: string;
  definitionId?: string;
  name: string;
  images: CreatureImages;
  // remaining creature state fields...
}

interface CreatureImages {
  /** Full-size, full-body player-facing illustration for presenting the creature at the table. */
  portrait: CreatureImage;
  /** Top-down token for maps viewed from above. */
  overheadToken: CreatureImage;
  /** Compact, full-body side-view token for multi-level maps viewed from the side. */
  paperDollToken: CreatureImage;
}

interface CreatureImage {
  assetId: string;
  uri?: string;
  altText: string;
  width: number;
  height: number;
  mimeType: `image/${string}`;
}
```

Each property must identify its own stored media asset. `portrait` shows the entire creature at full
illustration scale; it is not a headshot. `overheadToken` must use a true top-down camera angle.
`paperDollToken` must show the entire creature in profile at a smaller token scale. Generated or
uploaded images are stored as media assets; do not fabricate or persist signed `uri` values.

`worldId` is required and references the root `LocationState` that owns the creature. World-scoped
creature creation must use the authoritative route world ID rather than inventing or copying a
different location ID.

### Creature defense rating

`CreatureState` has no static armor class. Its required `defenseRating` is a set of dice
contributions from equipped armor:

```ts
interface CreatureDefenseRating {
  contributions: ArmorDefenseContribution[];
}

interface ArmorDefenseContribution {
  itemId: string;
  equipmentSlots: [EquipmentSlot, ...EquipmentSlot[]];
  dice: DiceExpression;
}
```

Each contribution references the equipped `ItemInstance` supplying it, records one or more occupied
equipment slots, and contains at least one dice term. The referenced armor definition uses
`defenseDice: DiceExpression`; it does not use a static armor-class value. When an attack is
declared, roll every term in every current armor contribution and sum the results. That defense
total contends with the attacker's fresh base `1d20` plus every term in the equipped weapon's
optional `hitDice`. Do not cache either total between attacks. The active rules system determines
how ties resolve.

For example, a helmet contributing `1d4`, gloves contributing `1d2`, a breastplate contributing
`1d10`, and pauldrons contributing `1d4` produce this defense rating:

```json
{
  "contributions": [
    {
      "itemId": "helmet-item-id",
      "equipmentSlots": ["head"],
      "dice": {
        "terms": [{ "kind": "dice", "count": 1, "size": 4, "label": "Helmet" }]
      }
    },
    {
      "itemId": "gloves-item-id",
      "equipmentSlots": ["hands"],
      "dice": {
        "terms": [{ "kind": "dice", "count": 1, "size": 2, "label": "Gloves" }]
      }
    },
    {
      "itemId": "breastplate-item-id",
      "equipmentSlots": ["chest"],
      "dice": {
        "terms": [
          { "kind": "dice", "count": 1, "size": 10, "label": "Breastplate" }
        ]
      }
    },
    {
      "itemId": "pauldrons-item-id",
      "equipmentSlots": ["shoulders"],
      "dice": {
        "terms": [
          { "kind": "dice", "count": 1, "size": 4, "label": "Pauldrons" }
        ]
      }
    }
  ]
}
```

A defense roll of `1 + 3 + 9 + 4 = 17` defeats an attacker base hit roll of `15` when the weapon has
no additional hit dice. Every subsequent attack causes both sides to roll again.

Weapons can optionally contribute a non-empty dice collection to the hit roll without replacing the
base `1d20`. This contribution is uncommon and should normally be reserved for very rare,
exceptionally well-made, or otherwise extraordinary weapons:

```ts
interface WeaponDefinition {
  category: WeaponCategory;
  hitDice?: { terms: [DiceTerm, ...DiceTerm[]]; label?: string };
  range:
    | { kind: "melee"; minimum: Distance; maximum: Distance }
    | { kind: "ranged"; minimum: Distance; maximum: Distance };
  damage: [WeaponDamageComponent, ...WeaponDamageComponent[]];
  wieldingModes: [WeaponWieldingMode, ...WeaponWieldingMode[]];
  properties: WeaponProperty[];
  // ammunition, mastery, and attack attribute omitted
}

interface WeaponDamageComponent {
  damage: DiceExpression;
  damageType: DamageType;
  savingThrow?: {
    test: D20TestDefinition & { kind: "saving-throw" };
    onSuccess: "negates" | "half-damage";
  };
}

interface WeaponWieldingMode {
  kind: "one-handed" | "two-handed" | "dual-wield";
  handsRequired: 1 | 2;
  requiresSecondWeapon?: boolean;
  proficiency?: {
    subjects: [string, ...string[]];
    match: "any" | "all";
    minimumRank: "half" | "proficient" | "expertise" | "custom";
    onFailure: {
      hitRollMode: "normal" | "disadvantage";
      weaponHitDice: "include" | "omit";
    };
  };
}
```

For example, a weapon with `hitDice: { terms: [{ kind: "dice", count: 1, size: 4 }] }` makes the
attacker's hit roll `1d20 + 1d4`. These hit dice affect only whether the attack lands. They are not
added to `damage`, copied into armor defense, or rolled when the weapon is not used for the attack.

`range.minimum` and `range.maximum` are the effective bounds for the attack. Melee weapons normally
use zero as the minimum and their reach as the maximum. Ranged weapons may have a nonzero minimum
when they are ineffective at very close range. `damage` is a non-empty collection because one hit
can deal several types—for example piercing plus explosive. A component's saving throw applies only
to that component after the hit lands.

`wieldingModes` is authoritative for hand usage and proficiency. A one-handed item definition is
equippable in either `main-hand` or `off-hand`; a two-handed item occupies both slots with the same
item-instance ID. A `dual-wield` mode has `handsRequired: 2` and `requiresSecondWeapon: true` because
it uses two separate one-handed weapon instances. Mode-specific proficiency subjects allow a
creature to be proficient with the weapon normally but still suffer disadvantage or lose weapon
hit dice when attempting an unfamiliar two-handed or dual-wield technique.

Common industrial-era damage types include `ballistic`, `piercing`, `slashing`, `bludgeoning`,
`explosive`, `concussive`, `fire`, `electrical`, `chemical`, and `poison`. `DamageType` remains open
to namespaced setting-specific values. Do not create synonymous parallel types: use `electrical`,
not `lightning`, and `concussive`, not `thunder`. Legacy `force`, `necrotic`, and `radiant` damage
must be replaced according to the physical injury mechanism or retained as an explicit migration
exception.

Every `ItemDefinition` has a required closed quality rating and one required stored inventory image:

```ts
interface ItemImage {
  assetId: MediaAssetId;
  uri?: string;
  altText: string;
  width: number;
  height: number;
  mimeType: `image/${string}`;
}

type ItemDefinition = Definition<"item", ItemComponents> & {
  image: ItemImage;
};

type ItemQuality = "ramshackle" | "standard" | "fine" | "exquisite";

type ItemCategory =
  | "weapon"
  | "armor"
  | "shield"
  | "adventuring-gear"
  | "ammunition"
  | "tool"
  | "mount"
  | "vehicle"
  | "trade-good"
  | "control-interface"
  | "compound"
  | "procedure-record"
  | "device"
  | "ring"
  | "rod"
  | "staff"
  | "wand"
  | "treasure"
  | string;

type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very-rare"
  | "legendary"
  | "unique"
  | "varies"
  | string;

interface ItemComponents {
  category: ItemCategory;
  quality: ItemQuality;
  operatingBasis?: OperatingBasis;
  understanding?: UnderstandingState;
  mechanismDescription?: string;
  provenance?: string;
  // category-specific and optional components omitted
}
```

`operatingBasis` is one primary value: `mechanical`, `chemical`, `electrical`, `thermal`, `optical`,
`acoustic`, `biological`, `neurological`, `computational`, `field-effect`, `materials`, `composite`,
`unknown`, or a custom value. Use `composite` plus `mechanismDescription` when no single basis is
honestly primary. Understanding is `understood`, `empirical`, `hypothesized`, `unknown`,
`classified`, or a custom value. Items are never classified as magical or mundane.

`AttunementRequirement`, `ItemInstance.attunedBy`, and `InventoryState.attunementLimit` remain one
universal mechanic. Attunement means operator-item synchronization, not magic. An item may explain
the process as calibration, pairing, authorization, biological tolerance, or interface bandwidth.
Item instances use `analyzed?: boolean` and `capacity?: ResourcePool`; do not emit legacy
`identified` or `charges` fields.

Quality describes construction and workmanship, independently of rarity, operating basis, or
understanding state. Both an
item definition and every physical `ItemInstance` carry a quality value; an instance normally uses
its definition's quality unless a workflow explicitly creates a variant. This square image depicts
one complete standalone item and is reused in inventories, equipment
slots, stores, and catalogs. AI-authored item JSON supplies a reserved image record and a
production-ready `extensions["aow:image-brief"]`; the generation workflow renders and uploads the
image, then replaces the reservation with authoritative media metadata. Do not fabricate signed
`uri` values.

Armor item definitions use this non-empty dice collection:

```ts
interface ArmorDefinition {
  category: "light" | "medium" | "heavy" | "shield" | string;
  defenseDice: { terms: [DiceTerm, ...DiceTerm[]]; label?: string };
  agilityContribution?: "none" | "full" | { maximum: number };
  mightRequirement?: number;
  stealthDisadvantage?: boolean;
  donTime?: number;
  doffTime?: number;
}
```

Armor dice originate only from persisted armor definitions and equipped armor instances. Creature
creation must initialize an empty inventory, empty equipment slots, and an empty defense
contribution list. It must not invent armor contributions. The armor-generation workflow creates
each `ItemDefinition`, creates its `ItemInstance` in the creature inventory, equips that instance,
and only then copies its `defenseDice` into the runtime contribution list.

### AI armor-generation output

`POST /api/ai/worlds/:worldId/creatures/:creatureId/armor-set` runs `create-armor.md` once for each
of `head`, `chest`, `arms`, `hands`, `legs`, and `feet`. Each model response is exactly one armor
`ItemDefinition`. The API supplies the authoritative world, creature, target slot, and user context;
then assigns authoritative IDs and source metadata, renders and stores each definition's inventory
image, persists a definition and inventory instance, equips it in the requested slot, and derives
the creature's defense contribution from the persisted armor dice. Generated JSON must not contain
an `ItemInstance`, equipment state, or creature defense contribution.

### AI item-generation output

`POST /api/ai/worlds/:worldId/items` combines `create-item.md`, the complete domain guide, the
authoritative root-world record, and user direction. It returns and persists exactly one
`ItemDefinition` in the `definitions` resource with `kind: "item"` and authoritative
`extensions["aow:worldId"]`. It also renders `extensions["aow:image-brief"]`, stores the result, and
sets the required authoritative `image` metadata. This catalog workflow does not create an
`ItemInstance` or put a copy in an inventory. IDs, keys, source metadata, and world ownership are
normalized by the API.

`POST /api/ai/worlds/:worldId/items/:itemId/image` regenerates only the stored inventory image for
an existing world-owned `ItemDefinition`. It uses the definition's description and saved
`extensions["aow:image-brief"]`, atomically replaces the definition's `image` metadata, removes the
previous media asset after a successful replacement, and removes the new asset if persistence
fails. It does not change item mechanics or create an `ItemInstance`.

`POST /api/ai/worlds/:worldId/weapons` combines `create-weapon.md`, this guide, the authoritative
root-world record, and one weapon concept. It normalizes identity, source, world ownership, and
hand-slot alternatives; renders and stores the required inventory image; then persists one
world-owned weapon `ItemDefinition`. It does not create an inventory instance.

## Definition catalog

Every definition uses the common `Definition` envelope. Implemented `kind` values and component
families are:

- `action`: activation, costs, prerequisites, targets, choices, test, outcomes, usage limit,
  sustained operation, and duration.
- `trait`: prerequisites, modifiers, embedded actions, triggers, grants, and choices.
- `condition`: condition type, modifiers, actions, triggers, stacking, and maximum level.
- `character-template`: level bounds, attribute defaults/generation, choices, and traits.
- `class`: hit die, primary attributes, save proficiencies, level progression, multiclass
  prerequisites, and discipline progression.
- `subclass`: parent class and level-to-feature mapping.
- `background`: attribute/language choices, proficiencies, equipment, feat/features, and
  characteristics.
- `feat`: category, prerequisites, repeatability, traits, and choices.
- `heritage`: short description, paired beneficial/harmful modifiers, skill-proficiency and
  discipline-access grants, choices, and prerequisites. Heritage is any formative influence fixed
  at character creation, including regional industries, cohorts, families, clubs, and institutions.
- `profession`: ordered expertise tiers, acquisition rules, action progressions, prerequisites,
  choices, and mutual exclusions.
- `monster`: physical classification and aliases, creature statistics, defenses, senses,
  communication capabilities, actions, disciplines, gear, and encounter data.
- `item`: category, physical/economic properties, equipment/container rules, rarity, primary
  operating basis, understanding, attunement-as-synchronization, weapon/armor/tool/vehicle data,
  armor defense dice, capacity,
  traits/actions/modifiers, and crafting.
- `discipline`: one shared band, function tags, one primary operating basis, understanding, observed
  phenomenon, activation time, range/targets, inputs, duration/sustained operation, prerequisites,
  outcomes, scaling, training/source compatibility, and related skill definition IDs.
- `skill`: optional default attribute. Skill identity supplies its stable ID, key, name,
  description, source, and tags; all other domain records reference the skill definition ID.
- `hazard`, `trap`, `disease`, `poison`, or `environmental-effect`: detection/disarm tests,
  predicate-triggered effects, reset duration, and severity.
- `language`: script and rarity.
- `table`: optional dice roll and ranged/weighted entries.
- `custom`: namespaced custom kind, optional schema definition, and JSON data.

A discipline uses this core structure:

```ts
interface DisciplineComponents {
  band: number;
  functionTags: string[];
  operatingBasis: OperatingBasis;
  understanding: UnderstandingState;
  observedPhenomenon: string;
  mechanismDescription?: string;
  provenance?: string;
  extendedProcedure?: boolean;
  activationTime: ActionCost[];
  reactionTrigger?: string;
  range: Distance | "self" | "touch" | "sight" | "unlimited" | "special";
  targets?: TargetDefinition[];
  inputs: DisciplineInput[];
  duration: Duration;
  sustainedOperation?: boolean;
  prerequisites?: Predicate[];
  outcomes: OutcomeDefinition[];
  scaling?: DisciplineScaling[];
  trainingProgramIds?: DefinitionId[];
  compatibleSourceIds?: DefinitionId[];
  relatedSkillIds?: DefinitionId[];
  safetyNotes?: string[];
  failureModes?: string[];
}

type DisciplineDefinition = Definition<"discipline", DisciplineComponents>;
```

Function tags state what the discipline does. `operatingBasis` states how it primarily works.
`relatedSkillIds` references competency definitions. These axes are independent and no magic-school
field exists. Never invent related skill, training, or source IDs.

`RulesCatalog` combines definitions, rule variants, and content packs. `GameSystemDefinition` adds
supported editions, engine schema version, enabled variants, configuration, and extensions.
`ExtensionSchema` supplies JSON Schema for namespaced data and declares the aggregate types to which
it applies.

## Executable rules model

Rules are data, not prose:

- `NumericExpression` supports constants, paths, attribute modifiers, proficiency bonus, level,
  resources, arithmetic, and conditionals.
- `ScalarExpression` adds JSON literals, dice, attribute/skill-definition lookups, counts, tables,
  choices, and event values.
- `Predicate` supports boolean composition, comparisons, conditions/tags/definitions,
  proficiency/attunement/sustained operation, damage type, distance/visibility/cover, relations, and
  custom rules.
- `RuleModifier` targets a rule path and performs add/subtract/multiply/divide/set/min/max,
  advantage/disadvantage, proficiency/expertise, allow, or prohibit operations.
- `RuleEffect` covers damage, healing, temporary hit points, resources, values, conditions,
  modifiers, movement/transit, actions, profession advancement, tests, choices, branches,
  iteration, deployment, object creation/destruction, events, narrative output, and custom effects.
- `TriggerDefinition` binds effects to lifecycle/combat events with predicate, timing, limit,
  optionality, and priority.
- `DiceExpression` is a list of dice or numeric terms; dice support keep/drop, reroll, explode, and
  minimum/maximum modifiers. `D20TestDefinition` describes checks, saves, attacks, opposed tests,
  roll modes, critical ranges, and tie behavior.

## Authoritative GameState

`GameState` contains:

```ts
interface GameState {
  version: VersionedState;
  systemId: string;
  systemVersion: string;
  campaign: CampaignState;
  entities: {
    characters: CharacterState[];
    creatures: CreatureState[];
    items: ItemInstance[];
    objects: ObjectState[];
    scenes: SceneState[];
    geography: LocationGraphState;
  };
  activeEncounter?: EncounterState;
  pendingDecisions: PendingDecision[];
  pendingExecutions: RuleExecutionState[];
  events: GameEvent[];
  random: {
    algorithm: string;
    seedCommitment?: string;
    cursor: number;
    entropyLogHash: string;
  };
  customEntityState: Record<string, JsonValue>;
  extensions?: Record<NamespacedKey, JsonValue>;
}
```

Game mutations are represented by discriminated `GameCommand` values for actions, choices,
movement, equipment/container operations, encounters, rest, travel, party location, professions,
time, GM effects, and namespaced custom commands. Their outcomes are captured as `CommandResult`
and append-only `GameEvent` records. Pending player/GM choices use `PendingDecision`; in-progress
actions use `RuleExecutionState`.

## Generation checklist

Before returning generated JSON:

1. Identify whether the request expects a definition, one state aggregate, or a complete game state.
2. Use one stable ID per object and reference that same ID from every `...Id` or `...Ids` field.
3. Include all required arrays and objects, even when they are empty.
4. Use the correct discriminant (`kind`, `phase`, `status`, or similar) for every union.
5. Keep reusable rules in definitions and mutable facts in state.
6. Keep geography normalized; parentage uses placement and travel edges use connections.
7. Put non-standard JSON under a namespaced extension key rather than inventing top-level fields.
8. Do not claim an asset URL is downloadable unless the asset has actually been created and stored.
9. Include portrait, overhead-token, and paper-doll-token assets for every creature state.
10. Include the owning root location as `worldId` for every creature state.
11. Use fresh armor dice contributions—not a static armor class—for creature defense ratings.
12. Return valid JSON only when the calling prompt requests JSON.
