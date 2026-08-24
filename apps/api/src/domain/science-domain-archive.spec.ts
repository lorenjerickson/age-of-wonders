import { BadRequestException } from "@nestjs/common";
import {
  createScienceDomainArchive,
  readScienceDomainArchive,
} from "./science-domain-archive";
import { isObject } from "./domain-resource";

describe("science domain archive", () => {
  it("round-trips representative legacy records through current contracts", () => {
    const archive = createScienceDomainArchive(
      [
        {
          resource: "definitions",
          data: {
            identity: { id: "definition-1", name: "Protective Screen" },
            kind: "spell",
            components: {
              level: 1,
              school: "abjuration",
              castingTime: [],
              range: "self",
              components: [],
              duration: { kind: "rounds", value: 1 },
              outcomes: [],
            },
          },
        },
        {
          resource: "creatures",
          data: {
            identity: { id: "creature-1" },
            name: "Ash Walker",
            creatureType: "fey",
            telepathy: 30,
          },
        },
        {
          resource: "locations",
          data: {
            identity: { id: "location-1" },
            name: "The Glass Elsewhere",
            kind: "plane",
          },
        },
      ],
      "2026-08-23T12:00:00.000Z",
    );

    const imported = readScienceDomainArchive(
      JSON.parse(JSON.stringify(archive)) as unknown,
    );

    expect(imported).toEqual(archive);
    const definition = imported.records.find(
      ({ resource }) => resource === "definitions",
    );
    expect(definition?.data.kind).toBe("discipline");
    const creature = imported.records.find(
      ({ resource }) => resource === "creatures",
    );
    const classification = creature?.data.classification;
    expect(isObject(classification) && classification.nature).toBe("unknown");
    const location = imported.records.find(
      ({ resource }) => resource === "locations",
    );
    const physicalEnvironment = location?.data.physicalEnvironment;
    expect(isObject(physicalEnvironment) && physicalEnvironment.kind).toBe(
      "unknown",
    );
    expect(imported.exceptions.map(({ name }) => name)).toContain("Ash Walker");
    expect(imported.exceptions.map(({ name }) => name)).toContain(
      "The Glass Elsewhere",
    );
  });

  it("rejects duplicate canonical identities without exposing them", () => {
    expect(() =>
      createScienceDomainArchive([
        {
          resource: "locations",
          data: {
            identity: { id: "opaque-location-id" },
            name: "First",
            kind: "site",
          },
        },
        {
          resource: "locations",
          data: {
            identity: { id: "opaque-location-id" },
            name: "Second",
            kind: "site",
          },
        },
      ]),
    ).toThrow(BadRequestException);

    try {
      createScienceDomainArchive([
        {
          resource: "locations",
          data: {
            identity: { id: "opaque-location-id" },
            name: "First",
            kind: "site",
          },
        },
        {
          resource: "locations",
          data: {
            identity: { id: "opaque-location-id" },
            name: "Second",
            kind: "site",
          },
        },
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error)).not.toContain("opaque-location-id");
    }
  });
});
