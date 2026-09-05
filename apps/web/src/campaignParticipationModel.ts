export type InvitationChannel = "email" | "sms";

export interface InvitationFormState {
  displayName: string;
  email: string;
  phone: string;
  emailSelected: boolean;
  smsSelected: boolean;
}

export interface CreateInvitationRequest {
  role: "player";
  displayName: string;
  email?: string;
  phone?: string;
  channels: InvitationChannel[];
}

export function invitationRequest(
  form: InvitationFormState,
): CreateInvitationRequest {
  const displayName = form.displayName.trim();
  const email = form.email.trim();
  const phone = form.phone.trim().replace(/[().\s-]/g, "");
  if (!displayName) throw new Error("Enter the player's name.");
  if (!form.emailSelected && !form.smsSelected) {
    throw new Error("Select email, SMS, or both.");
  }
  if (form.emailSelected && !email) throw new Error("Enter an email address.");
  if (form.smsSelected && !phone) throw new Error("Enter a phone number.");
  if (form.emailSelected && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (form.smsSelected && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Enter a valid international phone number.");
  }
  return {
    role: "player",
    displayName,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    channels: [
      ...(form.emailSelected ? (["email"] as const) : []),
      ...(form.smsSelected ? (["sms"] as const) : []),
    ],
  };
}

export function participantStatusLabel(status: string): string {
  const normalized = status.toLowerCase().replaceAll("_", "-");
  const labels: Record<string, string> = {
    accepted: "Joined campaign",
    active: "Joined campaign",
    pending: "Invitation pending",
    revoked: "Invitation revoked",
    expired: "Invitation expired",
    delivered: "Delivered",
    sent: "Sent",
    captured: "Captured for development",
    failed: "Delivery failed",
    queued: "Queued",
    "delivery-failed": "Delivery failed",
  };
  return labels[normalized] ?? "Status unavailable";
}
