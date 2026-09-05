import { createFileRoute } from "@tanstack/react-router";
import { CharacterCreationPage } from "../CharacterCreationPage";

export const Route = createFileRoute("/_player/play/characters/")({
  ssr: false,
  component: CharacterCreationPage,
});
