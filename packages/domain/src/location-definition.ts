import {
  map as projectState,
  distinctUntilChanged,
  type Observable,
} from "rxjs";
import { Map as DomainMap } from "./map";
import {
  locationPresentationIssue,
  withLocationPresentation,
} from "./location-presentation";
import {
  WORLD_CODEX_RESOURCES,
  type WorldLocationDefinition,
} from "@aow/common";
import {
  Entity,
  type DeepReadonly,
  type ValidationIssue,
  type CommandInvocation,
  type EntityTransition,
  type EntityOptions,
  type CommandReceipt,
} from "./entity";
import type { CodexDefinitionValidationContext } from "./codex-definition";

type JsonObject = Record<string, unknown>;
/** Raw bounded JSON keeps incomplete legacy drafts loadable for repair. */
export type LocationDefinitionState = JsonObject;
export interface LocationDefinitionValidationContext extends CodexDefinitionValidationContext {
  readonly rootLocationId?: string;
  readonly baseline?: unknown;
}
export interface OwnedLocationMap {
  readonly state: Readonly<Record<string, unknown>>;
  readonly state$: Observable<Readonly<Record<string, unknown>>>;
  readonly disposed: boolean;
  replace(
    map: WorldLocationDefinition["map"],
    initiator: unknown,
  ): Promise<CommandReceipt>;
}
export type LocationDefinitionCommands = {
  replaceMap: {
    params: { map: WorldLocationDefinition["map"] };
    context: Record<string, never>;
  };
  configurePresentation: {
    params: {
      weather?: import("@aow/common").LocationWeather | null;
      audiovisualEffects?:
        readonly import("@aow/common").LocationAudiovisualEffect[] | null;
    };
    context: Record<string, never>;
  };
  rename: { params: { name: string }; context: Record<string, never> };
};
export type LocationDefinitionEvents = {
  renamed: { name: string };
  presentationChanged: Record<string, never>;
  mapChanged: Record<string, never>;
};

/** Authored Location owns map presentation and containment; it has no travel graph. */
export class LocationDefinition extends Entity<
  LocationDefinitionState,
  LocationDefinitionCommands,
  LocationDefinitionEvents,
  LocationDefinitionValidationContext
> {
  readonly map: OwnedLocationMap;
  private constructor(
    data: LocationDefinitionState,
    context: LocationDefinitionValidationContext,
    options?: EntityOptions,
  ) {
    super(
      "location-definition",
      data,
      ["renamed", "presentationChanged", "mapChanged"],
      context,
      options,
    );
    this.validate(context);
    const owner = this;
    const project = (data: Readonly<Record<string, unknown>>) =>
      Object.freeze(
        Object.fromEntries(
          ["map", "image", "mapScene"]
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]]),
        ),
      );
    this.map = Object.freeze({
      get state() {
        return project(owner.state.data);
      },
      state$: owner.state$.pipe(
        projectState((state) => project(state.data)),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      ),
      get disposed() {
        return owner.disposed;
      },
      replace(map: WorldLocationDefinition["map"], initiator: unknown) {
        return owner.command("replaceMap", {
          initiator,
          params: { map },
          context: {},
        });
      },
    });
  }
  static deserialize(
    value: unknown,
    context: LocationDefinitionValidationContext = {},
    options?: EntityOptions,
  ): LocationDefinition {
    let payload = value;
    if (this.isObject(value) && value.type === "location-definition") {
      if (value.schemaVersion !== 1)
        throw new TypeError("Unsupported Location Definition schema version.");
      payload = value.data;
    }
    return this.deserializePayload(payload, context, options);
  }
  static deserializePayload(
    value: unknown,
    context: LocationDefinitionValidationContext = {},
    options?: EntityOptions,
  ): LocationDefinition {
    if (!this.isObject(value) || !this.isJson(value))
      throw new TypeError(
        "A Location Definition requires a bounded JSON object.",
      );
    return new LocationDefinition(value, context, options);
  }
  static presentationIssue(
    value: Record<string, unknown>,
    baseline?: Record<string, unknown>,
  ): string | undefined {
    return locationPresentationIssue(value, baseline);
  }
  serializePayload(): LocationDefinitionState {
    return this.serialize().data;
  }
  protected handleCommand<K extends keyof LocationDefinitionCommands>(
    name: K,
    invocation: CommandInvocation<LocationDefinitionCommands[K]>,
  ): EntityTransition<LocationDefinitionState, LocationDefinitionEvents> {
    if (name === "replaceMap") {
      const map = (invocation.params as { map: WorldLocationDefinition["map"] })
        .map;
      const issue = DomainMap.mapIssue(map);
      if (issue) throw new TypeError(issue);
      return {
        data: LocationDefinition.withMap(this.serializePayload(), map),
        events: [{ name: "mapChanged", context: {} }],
      };
    }
    if (name === "configurePresentation")
      return {
        data: withLocationPresentation(
          this.serializePayload(),
          invocation.params,
        ),
        events: [{ name: "presentationChanged", context: {} }],
      };
    if (name !== "rename")
      throw new TypeError("Unknown Location Definition command.");
    if (
      !LocationDefinition.nonEmpty(
        (invocation.params as { name: string }).name,
      ) ||
      (invocation.params as { name: string }).name.length > 120
    )
      throw new TypeError("Provide a valid Location name.");
    const nextName = (invocation.params as { name: string }).name.trim();
    const data = this.serializePayload();
    return data.name === nextName
      ? { data }
      : {
          data: { ...data, name: nextName },
          events: [{ name: "renamed", context: { name: nextName } }],
        };
  }
  /** Active references exclude retired top-level travel links retained only for legacy round trips. */
  references(id: string): boolean {
    const active = LocationDefinition.withoutKeys(
      this.serializePayload(),
      "connectedLocationIds",
      "adjacentLocationIds",
    );
    const contains = (value: unknown): boolean =>
      value === id ||
      (Array.isArray(value)
        ? value.some(contains)
        : LocationDefinition.isObject(value) &&
          Object.values(value).some(contains));
    return contains(active);
  }
  /** Select an existing authored map representation without inventing terrain content. */
  static authoringMap(
    previousMap: unknown,
    image: WorldLocationDefinition["image"],
    orientation: import("@aow/common").LocationMapOrientation,
  ): WorldLocationDefinition["map"] {
    return DomainMap.authoringMap(previousMap, image, orientation);
  }

  /** Saved image grids remain dormant during scenic presentation and on terrain maps. */
  effectiveSceneGrid():
    | { readonly kind: "square" | "hex"; readonly cellSizePixels: number }
    | undefined {
    const scene = LocationDefinition.object(this.state.data.mapScene);
    const orientation =
      scene.orientation ??
      LocationDefinition.object(this.state.data.image).orientation;
    if (
      orientation === "scenic" ||
      LocationDefinition.object(this.state.data.map).kind === "isometric"
    )
      return undefined;
    const grid = LocationDefinition.object(scene.grid);
    if (!LocationDefinition.validGrid(grid)) return undefined;
    return {
      kind: grid.kind as "square" | "hex",
      cellSizePixels: grid.cellSizePixels as number,
    };
  }
  static preservedArtwork(
    image: JsonObject,
    previous: unknown,
  ): JsonObject | undefined {
    const prior = this.object(previous);
    if (!this.nonEmpty(image.assetId) || image.assetId !== prior.assetId)
      return undefined;
    return this.withoutKeys(
      {
        ...prior,
        altText: image.altText,
        ...(image.orientation !== undefined
          ? { orientation: image.orientation }
          : {}),
      },
      "uri",
    );
  }
  static verifiedArtwork(image: JsonObject, mimeType: string): JsonObject {
    return this.withoutKeys({ ...image, mimeType }, "uri");
  }
  /** A map edit retains private state and dormant grid configuration. */
  static withMap(
    payload: JsonObject,
    map: WorldLocationDefinition["map"],
  ): JsonObject {
    const identity = this.object(payload.identity);
    const version = this.object(identity.version);
    return {
      ...this.withoutKeys(
        payload,
        "connectedLocationIds",
        "adjacentLocationIds",
      ),
      map,
      mapScene: {
        ...this.object(payload.mapScene),
        orientation:
          map.kind === "isometric"
            ? "isometric"
            : (this.object(payload.image).orientation ?? "scenic"),
      },
      identity: {
        ...identity,
        version: {
          ...version,
          revision: this.identityRevision(payload) + 1,
          updatedAt: new Date().toISOString(),
        },
      },
    };
  }
  /** Constructs draft data; callers must inspect entity validity before persistence. */
  static authorPayload(
    id: string,
    input: {
      name: string;
      description?: string;
      kind: string;
      parentLocationId?: string;
      profileSummary?: string;
      profileTags?: string[];
      weather?: import("@aow/common").LocationWeather | null;
      audiovisualEffects?:
        readonly import("@aow/common").LocationAudiovisualEffect[] | null;
      gmDescription?: string;
      discoveries?: WorldLocationDefinition["discoveries"];
      grantedConditions?: WorldLocationDefinition["grantedConditions"];
      image?: Record<string, unknown>;
      map?: WorldLocationDefinition["map"];
      mapSceneGrid?: { kind: "square" | "hex"; cellSizePixels: number } | null;
      mapSceneNotes?: string;
      mapOrientation?: "scenic" | "overhead" | "side-on" | "isometric";
    },
    previous?: unknown,
  ): WorldLocationDefinition {
    const prior = LocationDefinition.object(previous);
    const preserved = LocationDefinition.withoutKeys(
      prior,
      "description",
      "profile",
      "mapScene",
      "connectedLocationIds",
      "adjacentLocationIds",
    );
    const preservedProfile = LocationDefinition.withoutKeys(
      LocationDefinition.object(prior.profile),
      "summary",
      "tags",
    );
    const preservedMapScene = LocationDefinition.withoutKeys(
      LocationDefinition.object(prior.mapScene),
      ...(input.mapSceneNotes !== undefined ||
      LocationDefinition.object(prior.mapScene).notes === undefined
        ? ["notes"]
        : []),
      ...(input.mapOrientation !== undefined ||
      LocationDefinition.object(prior.mapScene).orientation === undefined
        ? ["orientation"]
        : []),
      ...(input.mapSceneGrid === null ? ["grid"] : []),
    );
    const mapScene = {
      ...preservedMapScene,
      ...(input.mapSceneNotes?.trim()
        ? { notes: input.mapSceneNotes.trim() }
        : {}),
      ...(input.mapOrientation ? { orientation: input.mapOrientation } : {}),
      ...(input.mapSceneGrid ? { grid: input.mapSceneGrid } : {}),
    };
    const image = input.image ?? prior.image;
    const imageFields = LocationDefinition.object(image);
    const previousImage = LocationDefinition.object(prior.image);
    // Older attached artwork can lack orientation. Repair it when re-saving
    // that asset so unrelated Location edits do not fail image validation.
    const repairImageOrientation =
      image !== undefined &&
      imageFields.orientation === undefined &&
      LocationDefinition.nonEmpty(previousImage.assetId) &&
      imageFields.assetId === previousImage.assetId;
    const previousOrientation =
      previousImage.orientation ??
      LocationDefinition.object(prior.mapScene).orientation;
    const repairedOrientation = ["scenic", "overhead", "side-on"].includes(
      String(previousOrientation),
    )
      ? previousOrientation
      : "scenic";
    return {
      ...withLocationPresentation(preserved, input),
      ...(!prior.map && image !== undefined && input.map === undefined
        ? { map: { kind: "image" as const } }
        : {}),
      ...(input.map !== undefined ? { map: input.map } : {}),
      ...(input.grantedConditions !== undefined
        ? { grantedConditions: input.grantedConditions }
        : {}),
      ...(input.mapOrientation &&
      input.map === undefined &&
      input.mapOrientation !== "isometric" &&
      LocationDefinition.object(prior.map).kind === "isometric"
        ? { map: { kind: "image" as const } }
        : {}),
      ...(input.gmDescription !== undefined
        ? { gmDescription: input.gmDescription }
        : {}),
      ...(input.discoveries !== undefined
        ? { discoveries: input.discoveries }
        : {}),
      ...(image !== undefined
        ? {
            image: (repairImageOrientation
              ? { ...imageFields, orientation: repairedOrientation }
              : image) as unknown as NonNullable<
              WorldLocationDefinition["image"]
            >,
          }
        : {}),
      identity: {
        id: id as WorldLocationDefinition["identity"]["id"],
        version: {
          revision: LocationDefinition.identityRevision(prior) + 1,
          updatedAt: new Date().toISOString(),
        },
      },
      name: input.name.trim(),
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
      kind: input.kind.trim(),
      placement: input.parentLocationId
        ? {
            kind: "within-parent",
            parentLocationId: input.parentLocationId as never,
            ...(LocationDefinition.object(prior.placement).parentLocationId ===
            input.parentLocationId
              ? LocationDefinition.placementDetails(prior.placement)
              : {}),
          }
        : { kind: "root" },
      profile: {
        ...preservedProfile,
        ...(input.profileSummary?.trim()
          ? { summary: input.profileSummary.trim() }
          : {}),
        tags: (input.profileTags ?? [])
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      ...(Object.keys(mapScene).length ? { mapScene } : {}),
      ...(LocationDefinition.isObject(prior.extensions)
        ? { extensions: prior.extensions as never }
        : {}),
    } as WorldLocationDefinition;
  }

  protected validateState(
    data: DeepReadonly<LocationDefinitionState>,
    context: LocationDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    return [
      ...this.canonicalIssues(data, context),
      ...this.relationshipIssues(data, context),
    ];
  }
  private canonicalIssues(
    data: DeepReadonly<LocationDefinitionState>,
    context: LocationDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const issue = (code: string, message: string): ValidationIssue[] => [
      ...issues,
      { code, message },
    ];
    const canonical = (code: string, message: string) =>
      issue("location-canonical-" + code, message);
    if (!LocationDefinition.isObject(data.identity))
      return canonical(
        "identity",
        "A Location requires server-owned identity and version data.",
      );
    if (
      !LocationDefinition.nonEmpty(data.identity.id) ||
      (context.sourceId !== undefined &&
        data.identity.id !== context.sourceId) ||
      !LocationDefinition.validVersion(data.identity.version)
    )
      return canonical(
        "identity",
        "The Location identity does not match its captured record.",
      );
    if (
      !LocationDefinition.nonEmpty(data.name) ||
      !LocationDefinition.nonEmpty(data.kind) ||
      !LocationDefinition.validPlacement(data.placement)
    )
      return canonical(
        "placement",
        "The Location name, kind, or containment placement is invalid.",
      );
    if (
      data.gmDescription !== undefined &&
      typeof data.gmDescription !== "string"
    )
      return canonical(
        "private-description",
        "The GM description must be text.",
      );
    if (data.discoveries !== undefined) {
      if (
        !Array.isArray(data.discoveries) ||
        data.discoveries.some(
          (claim) =>
            !LocationDefinition.isObject(claim) ||
            !LocationDefinition.nonEmpty(claim.id) ||
            !["truth", "rumor", "belief"].includes(String(claim.kind)) ||
            !LocationDefinition.nonEmpty(claim.statement),
        )
      )
        return canonical(
          "discoveries",
          "Discoveries require a kind and a statement.",
        );
      const ids = data.discoveries.map((claim) => (claim as JsonObject).id);
      if (new Set(ids).size !== ids.length)
        return canonical(
          "discoveries",
          "Each discovery must have its own identity.",
        );
    }
    if (data.map !== undefined) {
      // The owned Map delegates format kernels while retaining its command boundary.
      const mapIssue = DomainMap.mapIssue(data.map);
      if (mapIssue) return canonical("map", mapIssue);
    }
    const presentationIssue = locationPresentationIssue(
      data,
      context.mode === "draft"
        ? LocationDefinition.object(context.baseline)
        : undefined,
    );
    if (presentationIssue) return canonical("presentation", presentationIssue);
    if (data.image !== undefined && !LocationDefinition.validImage(data.image))
      return canonical(
        "image",
        "A Location image requires an image asset, alternative text, dimensions, and orientation.",
      );
    if (
      LocationDefinition.object(data.map).kind !== "isometric" &&
      !LocationDefinition.validImage(data.image)
    )
      issues.push({
        code: "location-canonical-map-required",
        message:
          "A Location requires an image map or an isometric terrain map.",
      });
    if (data.mapScene !== undefined) {
      const scene = LocationDefinition.object(data.mapScene);
      if (
        !LocationDefinition.isObject(data.mapScene) ||
        (scene.notes !== undefined && typeof scene.notes !== "string") ||
        (scene.orientation !== undefined &&
          !["scenic", "overhead", "side-on", "isometric"].includes(
            String(scene.orientation),
          )) ||
        (scene.grid !== undefined && !LocationDefinition.validGrid(scene.grid))
      )
        return canonical(
          "scene",
          "Choose valid scene notes, orientation, and a square or hex grid with a positive pixel cell size.",
        );
    }
    return issues;
  }
  private relationshipIssues(
    data: DeepReadonly<LocationDefinitionState>,
    context: LocationDefinitionValidationContext,
  ): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const issue = (code: string, message: string): ValidationIssue[] => [
      ...issues,
      { code, message },
    ];
    const identity = LocationDefinition.object(data.identity);
    if (context.mode === "draft") {
      const prior = LocationDefinition.object(context.baseline);
      for (const key of ["connectedLocationIds", "adjacentLocationIds"])
        if (
          data[key] !== undefined &&
          JSON.stringify(data[key]) !== JSON.stringify(prior[key])
        )
          return issue(
            "location-codex-retired-links",
            "Location links are retired; use parent containment to organize Locations.",
          );
    }
    const placement = LocationDefinition.object(data.placement);
    if (context.rootLocationId !== undefined) {
      if (identity.id === context.rootLocationId && placement.kind !== "root")
        return issue(
          "location-codex-parent",
          "The World root Location cannot have a parent.",
        );
      if (
        identity.id !== context.rootLocationId &&
        placement.kind !== "within-parent"
      )
        return issue("location-codex-parent", "A parent Location is required.");
    }
    if (placement.kind === "within-parent") {
      if (placement.parentLocationId === identity.id)
        return issue(
          "location-codex-parent",
          "A Location cannot contain itself.",
        );
      if (
        context.records &&
        !context.records.some(
          (record) =>
            record.resourceType === "locations" &&
            record.sourceId === placement.parentLocationId,
        )
      )
        return issue(
          "location-codex-parent",
          "The parent Location is not in this World draft.",
        );
    }
    if (data.grantedConditions !== undefined) {
      if (
        !Array.isArray(data.grantedConditions) ||
        data.grantedConditions.length > 200
      )
        return issue(
          "location-codex-grants",
          "Choose a valid granted Condition list.",
        );
      const ids = new Set<string>();
      for (const link of data.grantedConditions) {
        if (
          !LocationDefinition.isObject(link) ||
          !LocationDefinition.nonEmpty(link.conditionId) ||
          link.conditionId.length > 240 ||
          ids.has(link.conditionId) ||
          (context.records &&
            !context.records.some(
              (record) =>
                record.resourceType === WORLD_CODEX_RESOURCES.conditions &&
                record.sourceId === link.conditionId &&
                !!record.payload,
            ))
        )
          return issue(
            "location-codex-grants",
            "A granted Condition is duplicated or unavailable in this World.",
          );
        ids.add(link.conditionId);
      }
    }
    if (
      !context.records &&
      (placement.kind === "within-parent" ||
        (Array.isArray(data.grantedConditions) &&
          data.grantedConditions.length > 0))
    )
      return [
        ...issues,
        {
          code: "location-references-unresolved",
          message:
            "Location references have not been checked against a World capture.",
          unresolved: true,
        },
      ];
    return issues;
  }
  private static validGrid(value: unknown): boolean {
    return (
      this.isObject(value) &&
      ["square", "hex"].includes(String(value.kind)) &&
      typeof value.cellSizePixels === "number" &&
      Number.isFinite(value.cellSizePixels) &&
      value.cellSizePixels > 0
    );
  }
  private static validImage(value: unknown): boolean {
    const image = this.object(value);
    return (
      this.nonEmpty(image.assetId) &&
      this.nonEmpty(image.altText) &&
      typeof image.width === "number" &&
      Number.isFinite(image.width) &&
      image.width > 0 &&
      typeof image.height === "number" &&
      Number.isFinite(image.height) &&
      image.height > 0 &&
      typeof image.mimeType === "string" &&
      image.mimeType.startsWith("image/") &&
      ["scenic", "overhead", "side-on"].includes(String(image.orientation))
    );
  }
  private static placementDetails(value: unknown): JsonObject {
    const placement = LocationDefinition.object(value);
    return {
      ...(LocationDefinition.isObject(placement.mapPosition)
        ? { mapPosition: placement.mapPosition }
        : {}),
      ...(LocationDefinition.isObject(placement.border)
        ? { border: placement.border }
        : {}),
    };
  }

  private static identityRevision(value: JsonObject): number {
    const version = LocationDefinition.object(
      LocationDefinition.object(value.identity).version,
    );
    return Number.isInteger(version.revision) && Number(version.revision) > 0
      ? Number(version.revision)
      : 0;
  }
  private static object(value: unknown): JsonObject {
    return LocationDefinition.isObject(value) ? value : {};
  }
  private static withoutKeys(
    value: JsonObject,
    ...keys: readonly string[]
  ): JsonObject {
    const excluded = new Set(keys);
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !excluded.has(key)),
    );
  }
  private static isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  private static nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
  private static validVersion(value: unknown): boolean {
    return (
      LocationDefinition.isObject(value) &&
      Number.isInteger(value.revision) &&
      Number(value.revision) > 0 &&
      LocationDefinition.nonEmpty(value.updatedAt)
    );
  }
  private static validPlacement(value: unknown): boolean {
    return (
      LocationDefinition.isObject(value) &&
      (value.kind === "root" ||
        (value.kind === "within-parent" &&
          LocationDefinition.nonEmpty(value.parentLocationId)))
    );
  }
  private static isJson(
    value: unknown,
    depth = 0,
    ancestors = new Set<object>(),
  ): boolean {
    if (depth > 64) return false;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || value === null || ancestors.has(value))
      return false;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return false;
    ancestors.add(value);
    const valid = Object.values(value).every((child) =>
      LocationDefinition.isJson(child, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return valid;
  }
}
