import type { MechanicsObject } from "./itemMechanicsModel";
export const characterOptionFieldTypes = [
  "background",
  "background-characteristics",
] as const;
export type CharacterOptionFieldType =
  (typeof characterOptionFieldTypes)[number];
export const characterOptionFieldChildren: Record<
  CharacterOptionFieldType,
  Record<string, string>
> = {
  background: {
    modifierGrants: "modifier-grant",
    choices: "choice",
    characteristics: "background-characteristics",
  },
  "background-characteristics": {},
};
export function newCharacterOptionField(
  type: CharacterOptionFieldType,
): MechanicsObject {
  switch (type) {
    case "background":
    case "background-characteristics":
      return {};
  }
}
