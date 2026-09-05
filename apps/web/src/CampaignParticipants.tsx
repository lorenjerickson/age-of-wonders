import { type KeyboardEvent, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FieldLabel,
  SelectField,
  TextInput,
} from "@aow/ui";
import {
  createDomainRecord,
  createCampaignInvitation,
  listCampaignInvitations,
  listCampaignParticipants,
  listDomainRecords,
  retryCampaignInvitation,
  revokeCampaignInvitation,
  type CampaignInvitation,
  type CampaignParticipant,
} from "./api";
import {
  invitationRequest,
  participantStatusLabel,
  type InvitationFormState,
} from "./campaignParticipationModel";
import {
  CHARACTER_OPTION_KINDS,
  characterOptionDefinition,
  type CharacterOptionKind,
} from "./characterOptionModel";

const EMPTY_FORM: InvitationFormState = {
  displayName: "",
  email: "",
  phone: "",
  emailSelected: true,
  smsSelected: false,
};

export function CampaignParticipants({
  campaignId,
  worldId,
}: {
  campaignId: string;
  worldId: string;
}) {
  const [participants, setParticipants] = useState<CampaignParticipant[]>([]);
  const [invitations, setInvitations] = useState<CampaignInvitation[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [developmentJoinUrl, setDevelopmentJoinUrl] = useState("");
  const [optionKind, setOptionKind] =
    useState<CharacterOptionKind>("background");
  const [optionName, setOptionName] = useState("");
  const [optionDescription, setOptionDescription] = useState("");
  const [heritageBenefit, setHeritageBenefit] = useState("");
  const [heritageDrawback, setHeritageDrawback] = useState("");
  const [approvedOptions, setApprovedOptions] = useState<
    Record<CharacterOptionKind, string[]>
  >({ background: [], profession: [], heritage: [] });

  useEffect(() => {
    void listCampaignInvitations(campaignId).then(
      setInvitations,
      (caught: unknown) =>
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load campaign invitations.",
        ),
    );
    void listCampaignParticipants(campaignId).then(
      (members) => setParticipants(members.participants),
      () => undefined,
    );
    void Promise.all(
      CHARACTER_OPTION_KINDS.map((kind) =>
        listDomainRecords("definitions", { kind, worldId, limit: 200 }),
      ),
    ).then(
      ([backgrounds, professions, heritages]) =>
        setApprovedOptions({
          background: backgrounds.items.map(
            (option) => option.name ?? "Unnamed background",
          ),
          profession: professions.items.map(
            (option) => option.name ?? "Unnamed profession",
          ),
          heritage: heritages.items.map(
            (option) => option.name ?? "Unnamed heritage",
          ),
        }),
      () => setMessage("Could not load starting character options."),
    );
  }, [campaignId, worldId]);

  async function sendInvitation() {
    setMessage("");
    let request;
    try {
      request = invitationRequest(form);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Check the invitation details.",
      );
      return;
    }
    setBusy("new");
    try {
      const result = await createCampaignInvitation(campaignId, request);
      setInvitations(await listCampaignInvitations(campaignId));
      setDevelopmentJoinUrl(result.developmentJoinUrl ?? "");
      setForm(EMPTY_FORM);
      setMessage(`Invitation prepared for ${result.invitation.displayName}.`);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not send the invitation.",
      );
    } finally {
      setBusy("");
    }
  }

  async function updateInvitation(
    invitation: CampaignInvitation,
    action: "retry" | "revoke",
  ) {
    setBusy(invitation.id);
    setMessage("");
    try {
      if (action === "retry") {
        const result = await retryCampaignInvitation(campaignId, invitation.id);
        setInvitations(await listCampaignInvitations(campaignId));
        setDevelopmentJoinUrl(result.developmentJoinUrl ?? "");
        setMessage(`Invitation reissued for ${result.invitation.displayName}.`);
      } else {
        await revokeCampaignInvitation(campaignId, invitation.id);
        setInvitations((current) =>
          current.map((item) =>
            item.id === invitation.id ? { ...item, status: "revoked" } : item,
          ),
        );
        setMessage(`Invitation revoked for ${invitation.displayName}.`);
      }
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : `Could not ${action} the invitation.`,
      );
    } finally {
      setBusy("");
    }
  }

  function handleInvitationEnter(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) {
      return;
    }
    event.preventDefault();
    void sendInvitation();
  }

  async function addCharacterOption() {
    const name = optionName.trim();
    const description = optionDescription.trim();
    if (!name || !description) {
      setMessage("Enter a name and description for the character option.");
      return;
    }
    if (
      optionKind === "heritage" &&
      (!heritageBenefit.trim() || !heritageDrawback.trim())
    ) {
      setMessage("Describe both the heritage benefit and drawback.");
      return;
    }
    setBusy("character-option");
    setMessage("");
    try {
      const id = `definition:${crypto.randomUUID()}`;
      await createDomainRecord(
        "definitions",
        characterOptionDefinition({
          kind: optionKind,
          id,
          key: `aow:${optionKind}-${crypto.randomUUID()}`,
          worldId,
          name,
          description,
          heritageBenefit: heritageBenefit.trim(),
          heritageDrawback: heritageDrawback.trim(),
        }),
      );
      setApprovedOptions((current) => ({
        ...current,
        [optionKind]: [...current[optionKind], name],
      }));
      setOptionName("");
      setOptionDescription("");
      setHeritageBenefit("");
      setHeritageDrawback("");
      setMessage(`${name} is now available during character creation.`);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not add the character option.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card border border-base-300 bg-base-200 shadow-xl">
      <div className="card-body gap-7 p-6 md:p-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            Campaign access
          </p>
          <h2 className="card-title mt-2 text-2xl">Players and invitations</h2>
          <p className="mt-1 text-sm leading-6 text-base-content/60">
            Invite a player by email, SMS, or both. Joining starts their private
            character-creation workspace.
          </p>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
          <div
            className="rounded-box border border-base-300 bg-base-100 p-5"
            onKeyDown={handleInvitationEnter}
          >
            <h3 className="font-semibold">Invite a player</h3>
            <div className="mt-4 grid gap-4">
              <TextInput
                label="Player name"
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.currentTarget.value })
                }
              />
              <TextInput
                label="Email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.currentTarget.value })
                }
              />
              <TextInput
                label="Mobile phone"
                type="tel"
                placeholder="+1 415 555 0100"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.currentTarget.value })
                }
              />
              <div role="group" aria-labelledby="invitation-delivery-label">
                <FieldLabel id="invitation-delivery-label">
                  Send using
                </FieldLabel>
                <div className="mt-2 flex gap-5">
                  <Checkbox
                    label="Email"
                    checked={form.emailSelected}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        emailSelected: event.currentTarget.checked,
                      })
                    }
                  />
                  <Checkbox
                    label="SMS"
                    checked={form.smsSelected}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        smsSelected: event.currentTarget.checked,
                      })
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                tone="primary"
                loading={busy === "new"}
                onClick={() => void sendInvitation()}
              >
                Send invitation
              </Button>
            </div>
          </div>
          <div className="grid content-start gap-5">
            <div>
              <h3 className="font-semibold">Campaign members</h3>
              {participants.length ? (
                <ul className="mt-3 grid gap-2">
                  {participants.map((participant) => (
                    <li
                      key={participant.id}
                      className="flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3"
                    >
                      <span>
                        <span className="block font-medium">
                          {participant.displayName}
                        </span>
                        <span className="text-xs capitalize text-base-content/50">
                          {participant.role}
                        </span>
                      </span>
                      <Badge tone="success" outline>
                        {participantStatusLabel(participant.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-base-content/50">
                  No players have joined yet.
                </p>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Invitations</h3>
              {invitations.length ? (
                <ul className="mt-3 grid gap-2">
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="rounded-box border border-base-300 bg-base-100 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {invitation.displayName}
                          </p>
                          <p className="mt-1 text-xs text-base-content/50">
                            {participantStatusLabel(invitation.status)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {invitation.deliveries.some((delivery) =>
                            ["failed", "delivery-failed"].includes(
                              delivery.status.toLowerCase(),
                            ),
                          ) && (
                            <Button
                              type="button"
                              tone="ghost"
                              size="xs"
                              disabled={busy === invitation.id}
                              onClick={() =>
                                void updateInvitation(invitation, "retry")
                              }
                            >
                              Retry
                            </Button>
                          )}
                          {invitation.status.toLowerCase() === "pending" && (
                            <Button
                              type="button"
                              tone="ghost"
                              size="xs"
                              className="text-error"
                              disabled={busy === invitation.id}
                              onClick={() =>
                                void updateInvitation(invitation, "revoke")
                              }
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {invitation.deliveries.map((delivery) => (
                          <li key={delivery.channel}>
                            <Badge className="gap-1">
                              <span className="uppercase">
                                {delivery.channel}
                              </span>
                              {delivery.destinationLabel && (
                                <span>{delivery.destinationLabel}</span>
                              )}
                              <span>
                                · {participantStatusLabel(delivery.status)}
                              </span>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-base-content/50">
                  No invitations sent yet.
                </p>
              )}
            </div>
          </div>
        </div>
        <section className="rounded-box border border-base-300 bg-base-100 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Starting character options</h3>
              <p className="mt-1 text-sm text-base-content/55">
                Approve at least one background, profession, and heritage before
                inviting players to create characters.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {CHARACTER_OPTION_KINDS.map((kind) => (
                <Badge key={kind} outline className="capitalize">
                  {kind}: {approvedOptions[kind].length}
                </Badge>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Option type"
              value={optionKind}
              onChange={(event) =>
                setOptionKind(event.currentTarget.value as CharacterOptionKind)
              }
            >
              {CHARACTER_OPTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind[0]?.toUpperCase()}
                  {kind.slice(1)}
                </option>
              ))}
            </SelectField>
            <TextInput
              label="Name"
              value={optionName}
              onChange={(event) => setOptionName(event.currentTarget.value)}
            />
            <TextInput
              label="Description"
              fieldClassName="md:col-span-2"
              value={optionDescription}
              onChange={(event) =>
                setOptionDescription(event.currentTarget.value)
              }
            />
            {optionKind === "heritage" && (
              <>
                <TextInput
                  label="Benefit"
                  fieldClassName="md:col-span-2"
                  value={heritageBenefit}
                  onChange={(event) =>
                    setHeritageBenefit(event.currentTarget.value)
                  }
                />
                <TextInput
                  label="Drawback"
                  fieldClassName="md:col-span-2"
                  value={heritageDrawback}
                  onChange={(event) =>
                    setHeritageDrawback(event.currentTarget.value)
                  }
                />
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-base-content/50">
              {approvedOptions[optionKind].length
                ? approvedOptions[optionKind].join(", ")
                : `No ${optionKind} options approved yet.`}
            </p>
            <Button
              type="button"
              tone="secondary"
              size="sm"
              loading={busy === "character-option"}
              onClick={() => void addCharacterOption()}
            >
              Add option
            </Button>
          </div>
        </section>
        {message && <Alert>{message}</Alert>}
        {developmentJoinUrl && (
          <Alert tone="info">
            <span>Development delivery captured.</span>
            <a
              className="link font-semibold"
              href={developmentJoinUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open invitation
            </a>
          </Alert>
        )}
      </div>
    </section>
  );
}
