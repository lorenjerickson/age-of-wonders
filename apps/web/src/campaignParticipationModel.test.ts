import { describe, expect, it } from "vitest";
import {
  invitationRequest,
  participantStatusLabel,
} from "./campaignParticipationModel";

describe("invitationRequest", () => {
  it("normalizes a player invitation sent over both selected channels", () => {
    expect(
      invitationRequest({
        displayName: "  Ada Lovelace ",
        email: " ADA@Example.com ",
        phone: " +1 415 555 0100 ",
        emailSelected: true,
        smsSelected: true,
      }),
    ).toEqual({
      role: "player",
      displayName: "Ada Lovelace",
      email: "ADA@Example.com",
      phone: "+14155550100",
      channels: ["email", "sms"],
    });
  });

  it("rejects a selected channel without its destination", () => {
    expect(() =>
      invitationRequest({
        displayName: "Ada",
        email: "",
        phone: "",
        emailSelected: true,
        smsSelected: false,
      }),
    ).toThrow("Enter an email address");
  });

  it("rejects malformed selected destinations before sending", () => {
    expect(() =>
      invitationRequest({
        displayName: "Ada",
        email: "not-an-email",
        phone: "",
        emailSelected: true,
        smsSelected: false,
      }),
    ).toThrow("valid email");
  });
});

describe("participantStatusLabel", () => {
  it("uses readable labels rather than identifiers", () => {
    expect(participantStatusLabel("accepted")).toBe("Joined campaign");
    expect(participantStatusLabel("delivery-failed")).toBe("Delivery failed");
  });
});
