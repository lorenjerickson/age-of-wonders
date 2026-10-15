import type { DefinitionId, VehicleDefinition } from "@aow/common";
import { ItemDefinition } from "../src/item-definition";

// All Vehicle fields follow the authoritative value contract, including open vocabulary.
const vehicle: VehicleDefinition = {
  vehicleType: "world:submarine",
  size: "world:colossal",
  armorClass: -1.5,
  hitPoints: -2.5,
  damageThreshold: -3.5,
  crew: -4.5,
  passengers: -5.5,
  cargoCapacity: { value: -6.5, unit: "kilogram" },
  speeds: { sail: { value: -0.5, unit: "mile" } },
  components: ["component-definition" as DefinitionId],
  actions: [],
};
const item = ItemDefinition.deserializePayload({
  kind: "item",
  components: { vehicle },
});
item.dispose();
