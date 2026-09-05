import { ITEM_QUALITIES } from "@aow/common";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CompactInput,
  Field,
  FieldLabel,
  FileInput,
  HelpText,
  Input,
  Select,
  Tab,
  Textarea,
} from "@aow/ui";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createDomainRecord,
  createItemWithAi,
  createWeaponWithAi,
  deleteMedia,
  type DomainRecord,
  getDomainRecord,
  getMediaDownloadUrl,
  generateItemImageWithAi,
  listDomainRecords,
  replaceDomainRecord,
  uploadMedia,
} from "./api";
import {
  InternalLink,
  RouterButtonLink,
  useInternalNavigate,
} from "./navigation";

type CreationMode = "ai" | "manual";

const ITEM_CATEGORIES = [
  "weapon",
  "armor",
  "shield",
  "adventuring-gear",
  "ammunition",
  "tool",
  "control-interface",
  "compound",
  "procedure-record",
  "device",
  "ring",
  "rod",
  "staff",
  "wand",
  "treasure",
] as const;

const ARMOR_SLOTS = ["head", "chest", "arms", "hands", "legs", "feet"];
const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "very-rare",
  "legendary",
  "unique",
] as const;
const OPERATING_BASES = [
  "mechanical",
  "chemical",
  "electrical",
  "thermal",
  "optical",
  "acoustic",
  "biological",
  "neurological",
  "computational",
  "field-effect",
  "materials",
  "composite",
  "unknown",
] as const;
const UNDERSTANDING_STATES = [
  "understood",
  "empirical",
  "hypothesized",
  "unknown",
  "classified",
] as const;
const DIE_SIZES = [2, 4, 6, 8, 10, 12, 20, 100] as const;
const DISTANCE_UNITS = [
  "foot",
  "mile",
  "square",
  "hex",
  "meter",
  "kilometer",
] as const;
const WEAPON_CATEGORIES = [
  "simple-melee",
  "simple-ranged",
  "martial-melee",
  "martial-ranged",
] as const;
const DAMAGE_TYPES = [
  "ballistic",
  "piercing",
  "slashing",
  "bludgeoning",
  "explosive",
  "concussive",
  "fire",
  "electrical",
  "chemical",
  "poison",
] as const;

function objectAt(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function setAt(data: Record<string, unknown>, path: string[], value: unknown) {
  const clone = structuredClone(data);
  let target = clone;
  for (const key of path.slice(0, -1)) {
    const child = objectAt(target[key]);
    target[key] = child;
    target = child;
  }
  target[path.at(-1) ?? ""] = value;
  return clone;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
}

function fileDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

export function ItemArtwork({
  data,
  name,
  compact = false,
}: {
  data: Record<string, unknown>;
  name: string;
  compact?: boolean;
}) {
  const image = objectAt(data.image);
  const assetId = typeof image.assetId === "string" ? image.assetId : "";
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!assetId) return;
    let active = true;
    void getMediaDownloadUrl(assetId).then(
      (result) => {
        if (active) setUrl(result.url);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    <figure
      className={`aspect-square bg-base-300/60 ${compact ? "p-1" : "p-5"}`}
    >
      {url ? (
        <img
          src={url}
          alt={
            typeof image.altText === "string"
              ? image.altText
              : `Inventory view of ${name}`
          }
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-5xl text-base-content/20">
          ◇
        </div>
      )}
    </figure>
  );
}

function itemDetails(record: DomainRecord) {
  const identity = objectAt(record.data.identity);
  const components = objectAt(record.data.components);
  return {
    name:
      typeof identity.name === "string"
        ? identity.name
        : (record.name ?? "Unnamed item"),
    description:
      typeof identity.description === "string" ? identity.description : "",
    category:
      typeof components.category === "string"
        ? components.category
        : "uncategorized",
    rarity:
      typeof components.rarity === "string" ? components.rarity : "common",
    quality:
      typeof components.quality === "string" ? components.quality : "standard",
    operatingBasis:
      typeof components.operatingBasis === "string"
        ? components.operatingBasis
        : "unknown",
  };
}

async function loadWorldItems(worldId: string) {
  const definitions: DomainRecord[] = [];
  let offset = 0;
  let total = 0;
  do {
    const result = await listDomainRecords("definitions", {
      kind: "item",
      worldId,
      limit: 200,
      offset,
      sort: "updatedAt",
      order: "desc",
    });
    definitions.push(...result.items);
    total = result.total;
    if (!result.items.length) break;
    offset += result.items.length;
  } while (offset < total);
  return definitions;
}

export function ItemListPage({ worldId }: { worldId: string }) {
  const [world, setWorld] = useState<DomainRecord>();
  const [items, setItems] = useState<DomainRecord[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [operatingBasis, setOperatingBasis] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getDomainRecord("locations", worldId),
      loadWorldItems(worldId),
    ]).then(
      ([loadedWorld, loadedItems]) => {
        if (!active) return;
        setWorld(loadedWorld);
        setItems(loadedItems);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load items",
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [worldId]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(items.map((item) => itemDetails(item).category)),
      ).sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const details = itemDetails(item);
      const matchesSearch =
        !query ||
        details.name.toLowerCase().includes(query) ||
        details.description.toLowerCase().includes(query);
      return (
        matchesSearch &&
        (category === "all" || details.category === category) &&
        (rarity === "all" || details.rarity === rarity) &&
        (operatingBasis === "all" || details.operatingBasis === operatingBasis)
      );
    });
  }, [items, search, category, rarity, operatingBasis]);

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="w-full px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-base-300 pb-8">
          <div>
            <InternalLink
              href={`/worlds/${encodeURIComponent(worldId)}`}
              className="text-sm text-primary"
            >
              {world?.name ?? "World"}
            </InternalLink>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">
              Items
            </h1>
            <p className="mt-3 text-base-content/55">
              The reusable item types created for this world.
            </p>
          </div>
          <RouterButtonLink
            href={`/worlds/${encodeURIComponent(worldId)}/items/new`}
            tone="primary"
          >
            + Create item
          </RouterButtonLink>
        </header>

        <section
          aria-label="Item filters"
          className="mt-8 grid gap-3 rounded-box border border-base-300 bg-base-200 p-4 md:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,auto))]"
        >
          <CompactInput
            label={<span aria-hidden="true">⌕</span>}
            type="search"
            placeholder="Search items"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="Filter by category"

            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <Select
            aria-label="Filter by rarity"

            value={rarity}
            onChange={(event) => setRarity(event.target.value)}
          >
            <option value="all">All rarities</option>
            {RARITIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <Select
            aria-label="Filter by operating basis"

            value={operatingBasis}
            onChange={(event) => setOperatingBasis(event.target.value)}
          >
            <option value="all">All operating bases</option>
            {OPERATING_BASES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </section>

        {error && (
          <Alert tone="error" className="mt-6">
            {error}
          </Alert>
        )}
        {loading ? (
          <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(180px,200px))] justify-start gap-4">
            {[0, 1, 2].map((value) => (
              <div
                key={value}
                className="skeleton aspect-[4/7] w-full max-w-[200px]"
              />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(180px,200px))] justify-start gap-4">
            {filtered.map((item) => {
              const details = itemDetails(item);
              return (
                <InternalLink
                  key={item.id}
                  href={`/worlds/${encodeURIComponent(worldId)}/items/${encodeURIComponent(item.id)}`}
                  className="card w-full max-w-[200px] overflow-hidden border border-base-300 bg-base-200 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <ItemArtwork data={item.data} name={details.name} />
                  <div className="card-body gap-2 p-3">
                    <div>
                      <h2 className="line-clamp-2 text-base leading-5 font-semibold">
                        {details.name}
                      </h2>
                      <Badge
                        tone="primary"
                        outline
                        size="sm"
                        className="mt-2 max-w-full truncate"
                      >
                        {details.operatingBasis}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-base-content/55">
                      {details.description || "No description yet."}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-1 pt-1">
                      <Badge size="sm">{details.category}</Badge>
                      <Badge size="sm">{details.rarity}</Badge>
                      <Badge size="sm">{details.quality}</Badge>
                    </div>
                  </div>
                </InternalLink>
              );
            })}
          </div>
        ) : (
          <div className="card mt-6 border border-dashed border-base-300 bg-base-200/40">
            <div className="card-body items-center py-14 text-center">
              <span className="text-4xl text-primary" aria-hidden="true">
                ◇
              </span>
              <h2 className="mt-2 text-xl font-semibold">
                {items.length ? "No matching items" : "No items yet"}
              </h2>
              <p className="max-w-md text-base-content/55">
                {items.length
                  ? "Try clearing or broadening the current filters."
                  : "Create an item manually or let AI design one from this world’s context."}
              </p>
              {!items.length && (
                <RouterButtonLink
                  href={`/worlds/${encodeURIComponent(worldId)}/items/new`}
                  tone="primary"
                  className="mt-3"
                >
                  Create your first item
                </RouterButtonLink>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export function ItemCreatePage({ worldId }: { worldId: string }) {
  const navigate = useInternalNavigate();
  const [world, setWorld] = useState<DomainRecord>();
  const [mode, setMode] = useState<CreationMode>("ai");
  const [generationType, setGenerationType] = useState<"item" | "weapon">(
    "item",
  );
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("adventuring-gear");
  const [rarity, setRarity] = useState<string>("common");
  const [quality, setQuality] = useState<string>("standard");
  const [operatingBasis, setOperatingBasis] = useState("mechanical");
  const [understanding, setUnderstanding] = useState("understood");
  const [slot, setSlot] = useState("chest");
  const [defenseDie, setDefenseDie] = useState(6);
  const [weaponCategory, setWeaponCategory] = useState("simple-melee");
  const [weaponRangeKind, setWeaponRangeKind] = useState<"melee" | "ranged">(
    "melee",
  );
  const [minimumRange, setMinimumRange] = useState(0);
  const [maximumRange, setMaximumRange] = useState(5);
  const [damageCount, setDamageCount] = useState(1);
  const [damageDie, setDamageDie] = useState(6);
  const [damageType, setDamageType] = useState("slashing");
  const [wieldingKind, setWieldingKind] = useState<"one-handed" | "two-handed">(
    "one-handed",
  );
  const [addsHitDice, setAddsHitDice] = useState(false);
  const [hitDie, setHitDie] = useState(4);
  const [imageFile, setImageFile] = useState<File>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getDomainRecord("locations", worldId).then(
      setWorld,
      (caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load world",
        ),
    );
  }, [worldId]);

  async function createWithAi(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const result =
        generationType === "weapon"
          ? await createWeaponWithAi(worldId, prompt.trim())
          : await createItemWithAi(worldId, prompt.trim());
      await navigate(
        `/worlds/${encodeURIComponent(worldId)}/items/${encodeURIComponent(result.definition.id)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create item",
      );
      setWorking(false);
    }
  }

  async function createManually(event: FormEvent) {
    event.preventDefault();
    if (!imageFile) {
      setError("Choose the required inventory image.");
      return;
    }
    setWorking(true);
    setError("");
    let uploadedId = "";
    try {
      const id = crypto.randomUUID();
      const armor = category === "armor";
      const weapon = category === "weapon";
      const dimensions = await fileDimensions(imageFile);
      const asset = await uploadMedia(imageFile, "items", [
        "item-image",
        `item:${id}`,
        `world:${worldId}`,
      ]);
      uploadedId = asset.id;
      const definition = await createDomainRecord("definitions", {
        identity: {
          id,
          key: `aow:${slug(name) || "item"}-${id.slice(0, 8)}`,
          name: name.trim(),
          description: description.trim(),
          source: {
            namespace: "aow",
            edition: "homebrew:age-of-wonders",
            license: "private",
          },
          tags: [category, ...(armor ? [slot] : [])],
        },
        kind: "item",
        image: {
          assetId: asset.id,
          altText: `Inventory view of ${name.trim()}`,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: asset.mimeType,
        },
        components: {
          category,
          quality,
          rarity,
          operatingBasis,
          understanding,
          ...(armor
            ? {
                equippable: { compatibleSlotSets: [[slot]] },
                armor: {
                  category: "medium",
                  defenseDice: {
                    terms: [
                      {
                        kind: "dice",
                        count: 1,
                        size: defenseDie,
                        label: name.trim(),
                      },
                    ],
                  },
                },
              }
            : {}),
          ...(weapon
            ? {
                equippable: {
                  compatibleSlotSets:
                    wieldingKind === "two-handed"
                      ? [["main-hand", "off-hand"]]
                      : [["main-hand"], ["off-hand"]],
                },
                weapon: {
                  category: weaponCategory,
                  ...(addsHitDice
                    ? {
                        hitDice: {
                          terms: [
                            {
                              kind: "dice",
                              count: 1,
                              size: hitDie,
                              label: `${name.trim()} accuracy`,
                            },
                          ],
                        },
                      }
                    : {}),
                  range: {
                    kind: weaponRangeKind,
                    minimum: { value: minimumRange, unit: "foot" },
                    maximum: { value: maximumRange, unit: "foot" },
                  },
                  damage: [
                    {
                      damage: {
                        terms: [
                          {
                            kind: "dice",
                            count: damageCount,
                            size: damageDie,
                            label: name.trim(),
                          },
                        ],
                      },
                      damageType,
                    },
                  ],
                  wieldingModes: [
                    {
                      kind: wieldingKind,
                      handsRequired: wieldingKind === "two-handed" ? 2 : 1,
                    },
                  ],
                  properties:
                    wieldingKind === "two-handed" ? ["two-handed"] : [],
                },
              }
            : {}),
        },
        extensions: { "aow:worldId": worldId },
      });
      await navigate(
        `/worlds/${encodeURIComponent(worldId)}/items/${encodeURIComponent(definition.id)}`,
      );
    } catch (caught) {
      if (uploadedId) await deleteMedia(uploadedId).catch(() => undefined);
      setError(
        caught instanceof Error ? caught.message : "Could not create item",
      );
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <div className="w-full px-6 py-8 lg:px-10">
        <header className="border-b border-base-300 pb-8">
          <InternalLink
            href={`/worlds/${encodeURIComponent(worldId)}/items`}
            className="text-sm text-primary"
          >
            ← {world?.name ?? "Items"}
          </InternalLink>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Create item
          </h1>
          <p className="mt-3 text-base-content/55">
            Start with the essential fields or let AI design an item grounded in
            the full world record.
          </p>
        </header>

        <div role="tablist" className="tabs tabs-box mt-8 w-fit">
          <Tab
            type="button"
            active={mode === "ai"}
            onClick={() => setMode("ai")}
          >
            Create with AI
          </Tab>
          <Tab
            type="button"
            active={mode === "manual"}
            onClick={() => setMode("manual")}
          >
            Create manually
          </Tab>
        </div>
        {error && (
          <Alert tone="error" className="mt-6">
            {error}
          </Alert>
        )}

        {mode === "ai" ? (
          <form
            onSubmit={(event) => void createWithAi(event)}
            className="card mt-6 border border-primary/20 bg-primary/[0.06] shadow-xl"
          >
            <div className="card-body gap-5">
              <div>
                <h2 className="card-title">Describe the item</h2>
                <p className="mt-2 text-sm leading-6 text-base-content/60">
                  Your direction is combined with the current world and the
                  project’s item-generation prompt.
                </p>
              </div>
              <Field
                className="max-w-sm"
                label="Item type"
                help="Weapons use the dedicated range, damage, wielding, and hit-dice generation contract."
              >
                <Select
                  value={generationType}
                  onChange={(event) =>
                    setGenerationType(event.target.value as "item" | "weapon")
                  }
                >
                  <option value="item">General item</option>
                  <option value="weapon">Weapon</option>
                </Select>
              </Field>
              <Textarea
                autoFocus
                required
                minLength={3}
                className="min-h-56 w-full text-base leading-7"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A practical piece of survey equipment used by expeditions crossing the glass marshes…"
              />
              <div className="card-actions items-center justify-between">
                <span className="text-xs text-base-content/50">
                  Uses{" "}
                  {generationType === "weapon"
                    ? "create-weapon.md"
                    : "create-item.md"}{" "}
                  + full world context
                </span>
                <Button
                  type="submit"
                  tone="primary"
                  disabled={working || prompt.trim().length < 3}
                >
                  {working && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  Generate item
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => void createManually(event)}
            className="card mt-6 border border-base-300 bg-base-200 shadow-xl"
          >
            <div className="card-body gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field className="sm:col-span-2" label={<>Name</>}>
                  <Input
                    required

                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field className="sm:col-span-2" label={<>Description</>}>
                  <Textarea
                    required
                    className="min-h-32 w-full"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Field label={<>Category</>}>
                  <Select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    {ITEM_CATEGORIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={<>Rarity</>}>
                  <Select
                    value={rarity}
                    onChange={(event) => setRarity(event.target.value)}
                  >
                    {RARITIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={<>Quality</>}>
                  <Select
                    value={quality}
                    onChange={(event) => setQuality(event.target.value)}
                  >
                    {ITEM_QUALITIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={<>Operating basis</>}>
                  <Select
                    value={operatingBasis}
                    onChange={(event) => setOperatingBasis(event.target.value)}
                  >
                    {OPERATING_BASES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={<>Understanding</>}>
                  <Select
                    value={understanding}
                    onChange={(event) => setUnderstanding(event.target.value)}
                  >
                    {UNDERSTANDING_STATES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field
                  className="sm:col-span-2"
                  label="Inventory image"
                  help="Use a clear square view of the complete standalone item."
                >
                  <FileInput
                    required
                    accept="image/*"

                    onChange={(event) => setImageFile(event.target.files?.[0])}
                  />
                </Field>
                {category === "armor" && (
                  <>
                    <Field label={<>Equipment slot</>}>
                      <Select
                        value={slot}
                        onChange={(event) => setSlot(event.target.value)}
                      >
                        {ARMOR_SLOTS.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={<>Defense die</>}>
                      <Select
                        value={defenseDie}
                        onChange={(event) =>
                          setDefenseDie(Number(event.target.value))
                        }
                      >
                        {[2, 4, 6, 8, 10, 12].map((value) => (
                          <option key={value} value={value}>
                            1d{value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}
                {category === "weapon" && (
                  <section className="grid gap-5 rounded-box border border-base-300 bg-base-100/50 p-4 sm:col-span-2 sm:grid-cols-2">
                    <h3 className="font-semibold sm:col-span-2">
                      Weapon mechanics
                    </h3>
                    <Field label={<>Weapon category</>}>
                      <Select
                        value={weaponCategory}
                        onChange={(event) =>
                          setWeaponCategory(event.target.value)
                        }
                      >
                        {WEAPON_CATEGORIES.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={<>Wielding</>}>
                      <Select
                        value={wieldingKind}
                        onChange={(event) =>
                          setWieldingKind(
                            event.target.value as "one-handed" | "two-handed",
                          )
                        }
                      >
                        <option value="one-handed">One handed</option>
                        <option value="two-handed">Two handed</option>
                      </Select>
                    </Field>
                    <Field label={<>Range type</>}>
                      <Select
                        value={weaponRangeKind}
                        onChange={(event) =>
                          setWeaponRangeKind(
                            event.target.value as "melee" | "ranged",
                          )
                        }
                      >
                        <option value="melee">Melee</option>
                        <option value="ranged">Ranged</option>
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={<>Minimum (ft)</>}>
                        <Input
                          type="number"
                          min={0}

                          value={minimumRange}
                          onChange={(event) =>
                            setMinimumRange(Number(event.target.value))
                          }
                        />
                      </Field>
                      <Field label={<>Maximum (ft)</>}>
                        <Input
                          type="number"
                          min={0}

                          value={maximumRange}
                          onChange={(event) =>
                            setMaximumRange(Number(event.target.value))
                          }
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                      <Field label={<>Damage dice</>}>
                        <Input
                          type="number"
                          min={1}

                          value={damageCount}
                          onChange={(event) =>
                            setDamageCount(Number(event.target.value))
                          }
                        />
                      </Field>
                      <Field label={<>Die size</>}>
                        <Select
                          value={damageDie}
                          onChange={(event) =>
                            setDamageDie(Number(event.target.value))
                          }
                        >
                          {DIE_SIZES.map((value) => (
                            <option key={value} value={value}>
                              d{value}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={<>Damage type</>}>
                        <Input
                          list="damage-type-options"

                          value={damageType}
                          onChange={(event) =>
                            setDamageType(event.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Checkbox
                        label="Add an uncommon hit-die contribution"
                        checked={addsHitDice}
                        onChange={(event) =>
                          setAddsHitDice(event.target.checked)
                        }
                      />
                    </div>
                    {addsHitDice && (
                      <Field className="max-w-xs" label={<>Hit die</>}>
                        <Select
                          value={hitDie}
                          onChange={(event) =>
                            setHitDie(Number(event.target.value))
                          }
                        >
                          {DIE_SIZES.map((value) => (
                            <option key={value} value={value}>
                              1d{value}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                  </section>
                )}
                <datalist id="damage-type-options">
                  {DAMAGE_TYPES.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </div>
              <div className="card-actions justify-end">
                <Button
                  type="submit"
                  tone="primary"
                  disabled={working || !name.trim() || !description.trim()}
                >
                  {working && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  Create item
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function DiceTermsField({
  terms,
  onChange,
}: {
  terms: unknown[];
  onChange: (terms: unknown[]) => void;
}) {
  function update(index: number, key: string, value: unknown) {
    const next = [...terms];
    next[index] = { ...objectAt(next[index]), [key]: value };
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      {terms.map((candidate, index) => {
        const term = objectAt(candidate);
        if (term.kind !== "dice") {
          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-box border border-base-300 bg-base-100/50 px-3 py-2"
            >
              <span className="text-sm">
                Calculated {String(term.kind ?? "unknown")} term
              </span>
              <Button
                type="button"
                tone="ghost"
                size="xs"
                disabled={terms.length === 1}
                onClick={() =>
                  onChange(terms.filter((_, item) => item !== index))
                }
              >
                Remove
              </Button>
            </div>
          );
        }
        return (
          <div
            key={index}
            className="grid gap-3 rounded-box border border-base-300 bg-base-100/50 p-3 sm:grid-cols-[7rem_8rem_minmax(10rem,1fr)_auto]"
          >
            <Field label={<>Count</>}>
              <Input
                type="number"
                min={1}

                value={typeof term.count === "number" ? term.count : 1}
                onChange={(event) =>
                  update(index, "count", Number(event.target.value))
                }
              />
            </Field>
            <Field label={<>Die</>}>
              <Select
                value={typeof term.size === "number" ? term.size : 4}
                onChange={(event) =>
                  update(index, "size", Number(event.target.value))
                }
              >
                {DIE_SIZES.map((value) => (
                  <option key={value} value={value}>
                    d{value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={<>Label</>}>
              <Input
                value={typeof term.label === "string" ? term.label : ""}
                onChange={(event) => update(index, "label", event.target.value)}
              />
            </Field>
            <Button
              type="button"
              tone="ghost"
              size="sm"
              className="self-end"
              disabled={terms.length === 1}
              onClick={() =>
                onChange(terms.filter((_, item) => item !== index))
              }
            >
              Remove
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        tone="outline"
        size="sm"
        className="w-fit"
        onClick={() =>
          onChange([...terms, { kind: "dice", count: 1, size: 4, label: "" }])
        }
      >
        + Add die
      </Button>
    </div>
  );
}

export function ItemEditorPage({
  itemId,
  worldId,
}: {
  itemId: string;
  worldId: string;
}) {
  const [record, setRecord] = useState<DomainRecord>();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void getDomainRecord("definitions", itemId).then(
      (loaded) => {
        const extensions = objectAt(loaded.data.extensions);
        if (loaded.kind !== "item" || extensions["aow:worldId"] !== worldId) {
          setError("This item does not belong to the selected world.");
          return;
        }
        setRecord(loaded);
        const loadedComponents = objectAt(loaded.data.components);
        setDraft(
          ITEM_QUALITIES.some((quality) => quality === loadedComponents.quality)
            ? structuredClone(loaded.data)
            : setAt(loaded.data, ["components", "quality"], "standard"),
        );
      },
      (caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load item",
        ),
    );
  }, [itemId, worldId]);

  function patch(path: string[], value: unknown) {
    setDraft((current) => setAt(current, path, value));
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    setSaving(true);
    setError("");
    try {
      const updated = await replaceDomainRecord(record, draft);
      setRecord(updated);
      setDraft(structuredClone(updated.data));
      setMessage("Item saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save item",
      );
    } finally {
      setSaving(false);
    }
  }

  async function replaceImage(file: File) {
    if (!record) return;
    setUploadingImage(true);
    setError("");
    setMessage("");
    let uploadedId = "";
    try {
      const dimensions = await fileDimensions(file);
      const asset = await uploadMedia(file, "items", [
        "item-image",
        `item:${record.id}`,
        `world:${worldId}`,
      ]);
      uploadedId = asset.id;
      const previous = objectAt(draft.image);
      const previousId =
        typeof previous.assetId === "string" ? previous.assetId : "";
      const name = String(objectAt(draft.identity).name ?? "item");
      const nextData = setAt(draft, ["image"], {
        assetId: asset.id,
        altText: `Inventory view of ${name}`,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: asset.mimeType,
      });
      const updated = await replaceDomainRecord(record, nextData);
      setRecord(updated);
      setDraft(structuredClone(updated.data));
      setMessage("Inventory image replaced.");
      if (previousId && previousId !== asset.id) {
        await deleteMedia(previousId).catch(() => undefined);
      }
    } catch (caught) {
      if (uploadedId) await deleteMedia(uploadedId).catch(() => undefined);
      setError(
        caught instanceof Error ? caught.message : "Could not replace image",
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function generateImage() {
    if (!record) return;
    setGeneratingImage(true);
    setError("");
    setMessage("");
    try {
      let current = record;
      if (JSON.stringify(draft) !== JSON.stringify(record.data)) {
        current = await replaceDomainRecord(record, draft);
        setRecord(current);
        setDraft(structuredClone(current.data));
      }
      const result = await generateItemImageWithAi(worldId, current.id);
      setRecord(result.definition);
      setDraft(structuredClone(result.definition.data));
      setMessage("Generated a new inventory image.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not generate image",
      );
    } finally {
      setGeneratingImage(false);
    }
  }

  if (!record && !error)
    return (
      <main className="min-h-screen bg-base-100 p-8">
        <div className="skeleton h-[60vh] w-full" />
      </main>
    );
  const identity = objectAt(draft.identity);
  const components = objectAt(draft.components);
  const category =
    typeof components.category === "string" ? components.category : "";
  const tags = Array.isArray(identity.tags) ? identity.tags.join(", ") : "";
  const armor = objectAt(components.armor);
  const defenseDice = objectAt(armor.defenseDice);
  const firstTerm = objectAt(
    Array.isArray(defenseDice.terms) ? defenseDice.terms[0] : undefined,
  );
  const equippable = objectAt(components.equippable);
  const slotSets = Array.isArray(equippable.compatibleSlotSets)
    ? equippable.compatibleSlotSets
    : [];
  const slot = Array.isArray(slotSets[0])
    ? String(slotSets[0][0] ?? "chest")
    : "chest";
  const weapon = objectAt(components.weapon);
  const weaponRange = objectAt(weapon.range);
  const minimumRange = objectAt(weaponRange.minimum);
  const maximumRange = objectAt(weaponRange.maximum);
  const hitDice = objectAt(weapon.hitDice);
  const hitDiceTerms = Array.isArray(hitDice.terms) ? hitDice.terms : [];
  const damageComponents = Array.isArray(weapon.damage) ? weapon.damage : [];
  const wieldingModes = Array.isArray(weapon.wieldingModes)
    ? weapon.wieldingModes
    : [];
  const properties = Array.isArray(weapon.properties)
    ? weapon.properties.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  function setWieldingMode(
    modeKind: "one-handed" | "two-handed" | "dual-wield",
    enabled: boolean,
  ) {
    const nextModes = wieldingModes.filter(
      (candidate) => objectAt(candidate).kind !== modeKind,
    );
    if (enabled) {
      nextModes.push({
        kind: modeKind,
        handsRequired: modeKind === "one-handed" ? 1 : 2,
        ...(modeKind === "dual-wield" ? { requiresSecondWeapon: true } : {}),
      });
    }
    const supportsOneHand = nextModes.some(
      (candidate) => objectAt(candidate).kind === "one-handed",
    );
    const supportsTwoHands = nextModes.some(
      (candidate) => objectAt(candidate).kind === "two-handed",
    );
    setDraft((current) => {
      let next = setAt(
        current,
        ["components", "weapon", "wieldingModes"],
        nextModes,
      );
      next = setAt(
        next,
        ["components", "equippable", "compatibleSlotSets"],
        [
          ...(supportsOneHand ? [["main-hand"], ["off-hand"]] : []),
          ...(supportsTwoHands ? [["main-hand", "off-hand"]] : []),
        ],
      );
      return next;
    });
    setMessage("");
  }

  function updateDamageComponent(
    index: number,
    update: Record<string, unknown>,
  ) {
    const next = [...damageComponents];
    next[index] = { ...objectAt(next[index]), ...update };
    patch(["components", "weapon", "damage"], next);
  }

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <form
        onSubmit={(event) => void save(event)}
        className="grid w-full gap-6 px-6 py-8 lg:px-10"
      >
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-base-300 pb-7">
          <div>
            <InternalLink
              href={`/worlds/${encodeURIComponent(worldId)}/items`}
              className="text-sm text-primary"
            >
              ← Back to items
            </InternalLink>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Edit item
            </h1>
          </div>
          <Button
            type="submit"
            tone="primary"
            disabled={saving || uploadingImage || generatingImage || !record}
          >
            {saving && <span className="loading loading-spinner loading-sm" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </header>
        {error && <Alert tone="error">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}
        {record && (
          <>
            <section className="card border border-base-300 bg-base-200">
              <div className="card-body grid items-center gap-6 sm:grid-cols-[16rem_1fr]">
                <ItemArtwork
                  data={draft}
                  name={String(identity.name ?? "item")}
                />
                <div className="grid gap-2">
                  <FieldLabel>Replace inventory image</FieldLabel>
                  <FileInput
                    accept="image/*"

                    disabled={uploadingImage || generatingImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void replaceImage(file);
                    }}
                  />
                  <HelpText>
                    {uploadingImage
                      ? "Uploading…"
                      : "Square transparent artwork works best."}
                  </HelpText>
                  <div className="divider my-1 text-xs text-base-content/40">
                    or
                  </div>
                  <Button
                    type="button"
                    tone="secondary"
                    className="w-full"
                    disabled={uploadingImage || generatingImage}
                    onClick={() => void generateImage()}
                  >
                    {generatingImage && (
                      <span className="loading loading-spinner loading-sm" />
                    )}
                    {generatingImage
                      ? "Generating image…"
                      : "Generate image with AI"}
                  </Button>
                  <HelpText>
                    Uses the item description and its saved visual brief.
                  </HelpText>
                </div>
              </div>
            </section>
            <section className="card border border-base-300 bg-base-200">
              <div className="card-body grid gap-5 sm:grid-cols-2">
                <Field className="sm:col-span-2" label={<>Name</>}>
                  <Input
                    required

                    value={
                      typeof identity.name === "string" ? identity.name : ""
                    }
                    onChange={(event) =>
                      patch(["identity", "name"], event.target.value)
                    }
                  />
                </Field>
                <Field className="sm:col-span-2" label={<>Description</>}>
                  <Textarea
                    className="min-h-36 w-full"
                    value={
                      typeof identity.description === "string"
                        ? identity.description
                        : ""
                    }
                    onChange={(event) =>
                      patch(["identity", "description"], event.target.value)
                    }
                  />
                </Field>
                <Field label={<>Category</>}>
                  <Input
                    readOnly
                    className="opacity-70"
                    value={
                      typeof components.category === "string"
                        ? components.category
                        : ""
                    }
                  />
                </Field>
                <Field label={<>Rarity</>}>
                  <Select
                    value={
                      typeof components.rarity === "string"
                        ? components.rarity
                        : "common"
                    }
                    onChange={(event) =>
                      patch(["components", "rarity"], event.target.value)
                    }
                  >
                    {RARITIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={<>Quality</>}>
                  <Select
                    value={
                      typeof components.quality === "string"
                        ? components.quality
                        : "standard"
                    }
                    onChange={(event) =>
                      patch(["components", "quality"], event.target.value)
                    }
                  >
                    {ITEM_QUALITIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field className="sm:col-span-2" label={<>Tags</>}>
                  <Input
                    value={tags}
                    onChange={(event) =>
                      patch(
                        ["identity", "tags"],
                        event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </Field>
                <Field label={<>Operating basis</>}>
                  <Select
                    value={
                      typeof components.operatingBasis === "string"
                        ? components.operatingBasis
                        : "unknown"
                    }
                    onChange={(event) =>
                      patch(
                        ["components", "operatingBasis"],
                        event.target.value,
                      )
                    }
                  >
                    {OPERATING_BASES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={<>Understanding</>}>
                  <Select
                    value={
                      typeof components.understanding === "string"
                        ? components.understanding
                        : "unknown"
                    }
                    onChange={(event) =>
                      patch(["components", "understanding"], event.target.value)
                    }
                  >
                    {UNDERSTANDING_STATES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                {category === "armor" && (
                  <>
                    <Field label={<>Equipment slot</>}>
                      <Input readOnly className="opacity-70" value={slot} />
                    </Field>
                    <Field label={<>Defense die</>}>
                      <Select
                        value={
                          typeof firstTerm.size === "number"
                            ? firstTerm.size
                            : 4
                        }
                        onChange={(event) =>
                          patch(
                            ["components", "armor", "defenseDice", "terms"],
                            [
                              {
                                ...firstTerm,
                                kind: "dice",
                                count:
                                  typeof firstTerm.count === "number"
                                    ? firstTerm.count
                                    : 1,
                                size: Number(event.target.value),
                                label:
                                  typeof firstTerm.label === "string"
                                    ? firstTerm.label
                                    : String(identity.name ?? "Armor"),
                              },
                            ],
                          )
                        }
                      >
                        {[2, 4, 6, 8, 10, 12].map((value) => (
                          <option key={value} value={value}>
                            1d{value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}
                {category === "weapon" && (
                  <section className="grid gap-6 rounded-box border border-base-300 bg-base-100/45 p-5 sm:col-span-2">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Weapon mechanics
                      </h2>
                      <p className="mt-1 text-sm text-base-content/55">
                        Hit dice affect accuracy; damage dice are rolled only
                        after the attack lands.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={<>Weapon category</>}>
                        <Select
                          value={
                            typeof weapon.category === "string"
                              ? weapon.category
                              : "simple-melee"
                          }
                          onChange={(event) =>
                            patch(
                              ["components", "weapon", "category"],
                              event.target.value,
                            )
                          }
                        >
                          {WEAPON_CATEGORIES.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={<>Range type</>}>
                        <Select
                          value={
                            weaponRange.kind === "ranged" ? "ranged" : "melee"
                          }
                          onChange={(event) =>
                            patch(
                              ["components", "weapon", "range", "kind"],
                              event.target.value,
                            )
                          }
                        >
                          <option value="melee">Melee</option>
                          <option value="ranged">Ranged</option>
                        </Select>
                      </Field>
                      {[
                        ["minimum", "Minimum range", minimumRange],
                        ["maximum", "Maximum range", maximumRange],
                      ].map(([key, label, distance]) => {
                        const value = objectAt(distance);
                        return (
                          <div
                            key={String(key)}
                            className="grid grid-cols-[1fr_8rem] gap-3"
                          >
                            <Field label={<>{String(label)}</>}>
                              <Input
                                type="number"
                                min={0}

                                value={
                                  typeof value.value === "number"
                                    ? value.value
                                    : 0
                                }
                                onChange={(event) =>
                                  patch(
                                    [
                                      "components",
                                      "weapon",
                                      "range",
                                      String(key),
                                      "value",
                                    ],
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </Field>
                            <Field label={<>Unit</>}>
                              <Select
                                value={
                                  typeof value.unit === "string"
                                    ? value.unit
                                    : "foot"
                                }
                                onChange={(event) =>
                                  patch(
                                    [
                                      "components",
                                      "weapon",
                                      "range",
                                      String(key),
                                      "unit",
                                    ],
                                    event.target.value,
                                  )
                                }
                              >
                                {DISTANCE_UNITS.map((unit) => (
                                  <option key={unit}>{unit}</option>
                                ))}
                              </Select>
                            </Field>
                          </div>
                        );
                      })}
                    </div>

                    <div className="divider my-0" />
                    <section className="grid gap-3">
                      <div>
                        <Checkbox
                          label={
                            <>
                              Weapon contributes additional hit dice
                              <span className="ml-2 text-xs text-base-content/45">
                                Uncommon; normally fine, exquisite, or very
                                rare.
                              </span>
                            </>
                          }
                          checked={hitDiceTerms.length > 0}
                          onChange={(event) =>
                            patch(
                              ["components", "weapon", "hitDice"],
                              event.target.checked
                                ? {
                                    terms: [
                                      {
                                        kind: "dice",
                                        count: 1,
                                        size: 4,
                                        label: `${String(identity.name ?? "Weapon")} accuracy`,
                                      },
                                    ],
                                  }
                                : undefined,
                            )
                          }
                        />
                      </div>
                      {hitDiceTerms.length > 0 && (
                        <DiceTermsField
                          terms={hitDiceTerms}
                          onChange={(terms) =>
                            patch(
                              ["components", "weapon", "hitDice", "terms"],
                              terms,
                            )
                          }
                        />
                      )}
                    </section>

                    <div className="divider my-0" />
                    <section className="grid gap-4">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="font-semibold">Damage components</h3>
                        <Button
                          type="button"
                          tone="outline"
                          size="sm"
                          onClick={() =>
                            patch(
                              ["components", "weapon", "damage"],
                              [
                                ...damageComponents,
                                {
                                  damage: {
                                    terms: [
                                      { kind: "dice", count: 1, size: 6 },
                                    ],
                                  },
                                  damageType: "piercing",
                                },
                              ],
                            )
                          }
                        >
                          + Add damage type
                        </Button>
                      </div>
                      {damageComponents.map((candidate, index) => {
                        const component = objectAt(candidate);
                        const damage = objectAt(component.damage);
                        const terms = Array.isArray(damage.terms)
                          ? damage.terms
                          : [];
                        const savingThrow = objectAt(component.savingThrow);
                        const test = objectAt(savingThrow.test);
                        const difficultyClass = objectAt(test.difficultyClass);
                        return (
                          <div
                            key={index}
                            className="grid gap-4 rounded-box border border-base-300 bg-base-200/60 p-4"
                          >
                            <div className="flex items-end justify-between gap-4">
                              <Field className="grow" label={<>Damage type</>}>
                                <Input
                                  list="damage-type-options"

                                  value={
                                    typeof component.damageType === "string"
                                      ? component.damageType
                                      : ""
                                  }
                                  onChange={(event) =>
                                    updateDamageComponent(index, {
                                      damageType: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Button
                                type="button"
                                tone="ghost"
                                size="sm"
                                disabled={damageComponents.length === 1}
                                onClick={() =>
                                  patch(
                                    ["components", "weapon", "damage"],
                                    damageComponents.filter(
                                      (_, item) => item !== index,
                                    ),
                                  )
                                }
                              >
                                Remove component
                              </Button>
                            </div>
                            <DiceTermsField
                              terms={terms}
                              onChange={(nextTerms) =>
                                updateDamageComponent(index, {
                                  damage: { ...damage, terms: nextTerms },
                                })
                              }
                            />
                            <div>
                              <Checkbox
                                label="Requires a saving throw after the hit"
                                checked={Object.keys(savingThrow).length > 0}
                                onChange={(event) =>
                                  updateDamageComponent(index, {
                                    savingThrow: event.target.checked
                                      ? {
                                          test: {
                                            kind: "saving-throw",
                                            attribute: "agility",
                                            difficultyClass: {
                                              kind: "constant",
                                              value: 12,
                                            },
                                          },
                                          onSuccess: "half-damage",
                                        }
                                      : undefined,
                                  })
                                }
                              />
                            </div>
                            {Object.keys(savingThrow).length > 0 && (
                              <div className="grid gap-3 sm:grid-cols-3">
                                <Field label={<>Save attribute</>}>
                                  <Input
                                    value={
                                      typeof test.attribute === "string"
                                        ? test.attribute
                                        : ""
                                    }
                                    onChange={(event) =>
                                      updateDamageComponent(index, {
                                        savingThrow: {
                                          ...savingThrow,
                                          test: {
                                            ...test,
                                            kind: "saving-throw",
                                            attribute: event.target.value,
                                          },
                                        },
                                      })
                                    }
                                  />
                                </Field>
                                <Field label={<>Difficulty</>}>
                                  <Input
                                    type="number"
                                    min={0}

                                    value={
                                      typeof difficultyClass.value === "number"
                                        ? difficultyClass.value
                                        : 12
                                    }
                                    onChange={(event) =>
                                      updateDamageComponent(index, {
                                        savingThrow: {
                                          ...savingThrow,
                                          test: {
                                            ...test,
                                            kind: "saving-throw",
                                            difficultyClass: {
                                              kind: "constant",
                                              value: Number(event.target.value),
                                            },
                                          },
                                        },
                                      })
                                    }
                                  />
                                </Field>
                                <Field label={<>On success</>}>
                                  <Select
                                    value={
                                      savingThrow.onSuccess === "negates"
                                        ? "negates"
                                        : "half-damage"
                                    }
                                    onChange={(event) =>
                                      updateDamageComponent(index, {
                                        savingThrow: {
                                          ...savingThrow,
                                          onSuccess: event.target.value,
                                        },
                                      })
                                    }
                                  >
                                    <option value="half-damage">
                                      Half damage
                                    </option>
                                    <option value="negates">Negates</option>
                                  </Select>
                                </Field>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>

                    <div className="divider my-0" />
                    <section className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <h3 className="font-semibold">Wielding modes</h3>
                        <div className="mt-3 grid gap-3">
                          {(
                            [
                              ["one-handed", "One handed"],
                              ["two-handed", "Two handed"],
                              ["dual-wield", "Dual wield"],
                            ] as const
                          ).map(([kind, label]) => (
                            <div key={kind}>
                              <Checkbox
                                label={label}
                                checked={wieldingModes.some(
                                  (candidate) =>
                                    objectAt(candidate).kind === kind,
                                )}
                                onChange={(event) =>
                                  setWieldingMode(kind, event.target.checked)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <Field
                        label="Weapon properties"
                        help="Separate properties with commas."
                      >
                        <Textarea
                          className="min-h-28 w-full"
                          value={properties.join(", ")}
                          onChange={(event) =>
                            patch(
                              ["components", "weapon", "properties"],
                              event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="ammunition, loading, two-handed"
                        />
                      </Field>
                    </section>
                    <datalist id="damage-type-options">
                      {DAMAGE_TYPES.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </section>
                )}
              </div>
            </section>
          </>
        )}
      </form>
    </main>
  );
}
