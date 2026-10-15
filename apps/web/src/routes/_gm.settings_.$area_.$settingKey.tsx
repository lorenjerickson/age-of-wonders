import { createFileRoute } from "@tanstack/react-router";
import { SettingsLanding } from "./_gm.settings";
export const Route = createFileRoute("/_gm/settings_/$area_/$settingKey")({
  component: SettingsDestination,
});
function SettingsDestination() {
  return (
    <SettingsLanding
      areaId={Route.useParams().area}
      settingKey={Route.useParams().settingKey}
    />
  );
}
