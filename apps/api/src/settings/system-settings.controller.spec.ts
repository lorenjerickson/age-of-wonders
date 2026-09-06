import { GUARDS_METADATA } from "@nestjs/common/constants";
import { SystemAdministratorGuard } from "../auth/auth.guard";
import { SystemSettingsController } from "./system-settings.controller";

describe("SystemSettingsController", () => {
  it("is guarded by active System Administrator authority", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SystemSettingsController),
    ).toContain(SystemAdministratorGuard);
  });
});
