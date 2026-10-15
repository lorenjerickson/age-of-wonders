import {
  attributeScore,
  type DefinitionId,
  type CharacterDefinition as CharacterDefinitionPayload,
} from "@aow/common";
import { CharacterDefinition } from "../src/character-definition";

const canonical: CharacterDefinitionPayload = {
  kind: "character-template",
  identity: {
    id: "template" as DefinitionId,
    key: "test:template",
    name: "Adventurer",
    source: { namespace: "test", edition: "homebrew:custom" },
  },
  components: {
    attributeDefaults: { "test:resolve": attributeScore(50) },
    attributeGeneration: {
      kind: "standard-array",
      values: [attributeScore(50)],
    },
    traits: [
      {
        kind: "trait",
        identity: {
          id: "alert" as DefinitionId,
          key: "test:alert",
          name: "Alert",
          source: { namespace: "test", edition: "homebrew:custom" },
        },
        components: { actions: [] },
      },
    ],
  },
};
const character = CharacterDefinition.deserializePayload(canonical);
const kind: "character-template" = character.state.data.kind;
void kind;
character.command("rename", {
  initiator: "author",
  params: { name: "Explorer" },
  context: {},
});
// @ts-expect-error Character Definition authoring has no runtime use command.
character.command("use");
character.events.renamed.listen((event) => {
  const name: string = event.context.name;
  // @ts-expect-error Event context is immutable.
  event.context.name = name;
});
// @ts-expect-error State is immutable.
character.state.data.kind = "character-template";
