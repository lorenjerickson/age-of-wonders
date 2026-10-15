import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Button,
  FieldError,
  Select,
  SelectField,
  TextInput,
  Disclosure,
} from "@aow/ui";
import type {
  PlayerDetailProjection,
  PlayerDirectoryProjection,
  PlayerServerStanding,
} from "@aow/common";
import { FormEvent, useEffect, useState } from "react";
import { changePlayerStanding, getPlayer, listPlayers } from "../api";

export const Route = createFileRoute("/_gm/players")({
  component: PlayersLanding,
});

const STANDINGS: readonly PlayerServerStanding[] = [
  "active",
  "inactive",
  "banned",
];

export function PlayersLanding({ playerId }: { playerId?: string }) {
  const editing = Boolean(playerId);
  const [directory, setDirectory] = useState<PlayerDirectoryProjection>();
  const [selected, setSelected] = useState<PlayerDetailProjection>();
  const [search, setSearch] = useState("");
  const [standing, setStanding] = useState<PlayerServerStanding | "all">("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load(query = search) {
    setMessage("");
    try {
      setDirectory(
        await listPlayers({
          q: query.trim() || undefined,
          standing: standing === "all" ? undefined : standing,
          limit: 100,
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Players could not be loaded.",
      );
    }
  }

  useEffect(() => {
    void load();
    // Filters are applied explicitly by the form.
  }, []);

  useEffect(() => {
    let current = true;
    setSelected(undefined);
    if (playerId) {
      setBusy("profile");
      void getPlayer(playerId)
        .then((player) => {
          if (current) setSelected(player);
        })
        .catch((error: unknown) => {
          if (current)
            setMessage(
              error instanceof Error
                ? error.message
                : "Player could not be loaded.",
            );
        })
        .finally(() => {
          if (current) setBusy("");
        });
    }
    return () => {
      current = false;
    };
  }, [playerId]);

  async function updateStanding(target: PlayerServerStanding) {
    if (!selected || target === selected.standing) return;
    setBusy("standing");
    setMessage("");
    try {
      await changePlayerStanding(selected.playerId, selected.standing, target);
      setSelected(await getPlayer(selected.playerId));
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Player standing could not be changed.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-4 lg:px-10 lg:py-6">
      <h1 className="text-3xl font-semibold">
        {editing ? "Participant profile" : "Participants"}
      </h1>
      {editing && (
        <Link to="/players" className="btn btn-ghost mt-4 min-h-11">
          ← Back to participants
        </Link>
      )}

      <form
        hidden={editing}
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void load();
        }}
      >
        <TextInput
          className="min-h-11 min-w-48 flex-1"
          label="Search participants"
          placeholder="Search participants…"
          maxLength={120}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Disclosure summary="Filters" className="w-full order-last">
          <SelectField
            className="min-h-11"
            label="Standing"
            value={standing}
            onChange={(event) =>
              setStanding(event.currentTarget.value as typeof standing)
            }
          >
            <option value="all">All standings</option>
            {STANDINGS.map((value) => (
              <option key={value} value={value}>
                {title(value)}
              </option>
            ))}
          </SelectField>
        </Disclosure>
        <Button type="submit" tone="primary">
          Search
        </Button>
        <Button
          type="button"
          tone="ghost"
          className="min-h-11"
          onClick={() => {
            setSearch("");
            void load("");
          }}
        >
          Clear
        </Button>
      </form>

      {message && (
        <div className="mt-5">
          <FieldError>{message}</FieldError>
        </div>
      )}

      <div className="mt-6">
        <section hidden={editing}>
          <div className="border-b border-base-300 px-5 py-4 text-sm text-base-content/55">
            {directory
              ? `${directory.total} registered`
              : "Loading participants…"}
          </div>
          {directory?.items.length === 0 && (
            <p className="px-5 py-10 text-center text-base-content/55">
              No Player profiles match these filters. Profiles are created when
              a Player accepts an Instance invitation.
            </p>
          )}
          <ul className="space-y-3">
            {directory?.items.map((player) => (
              <li
                key={player.playerId}
                className="flex flex-wrap items-center gap-4 rounded-lg bg-base-200 px-4 py-5"
              >
                <div
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                >
                  {player.displayName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">
                    {player.displayName}
                  </p>
                  <p className="mt-1 text-sm text-base-content/55">
                    {title(player.standing)} · {player.membershipCount}{" "}
                    {player.membershipCount === 1
                      ? "membership"
                      : "memberships"}{" "}
                    · {player.characterCount}{" "}
                    {player.characterCount === 1 ? "Character" : "Characters"}
                  </p>
                </div>
                <Link
                  to="/players/$playerId"
                  params={{ playerId: player.playerId }}
                  className="btn btn-ghost min-h-11"
                >
                  View profile
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          hidden={!editing}
          className="rounded-lg bg-base-200 p-4 lg:p-6"
        >
          {!selected ? (
            <p className="text-sm leading-6 text-base-content/55">
              {busy === "profile"
                ? "Loading profile…"
                : "This profile is unavailable. Return to participants to select another profile."}
            </p>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Participant profile
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {selected.displayName}
                  </h2>
                </div>
                <Select
                  className="min-h-11"
                  aria-label="Player standing"
                  disabled={busy === "standing"}
                  value={selected.standing}
                  onChange={(event) =>
                    void updateStanding(
                      event.currentTarget.value as PlayerServerStanding,
                    )
                  }
                >
                  {STANDINGS.map((value) => (
                    <option key={value} value={value}>
                      {title(value)}
                    </option>
                  ))}
                </Select>
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-base-content/50">Email</dt>
                  <dd className="mt-1 break-words">
                    {selected.email ?? "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/50">Phone</dt>
                  <dd className="mt-1">{selected.phone ?? "Not provided"}</dd>
                </div>
              </dl>
              <h3 className="mt-7 font-semibold">Sign-in identities</h3>
              {selected.authenticationProviders.length === 0 ? (
                <p className="mt-2 text-sm text-base-content/55">
                  No identity provider is associated.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {selected.authenticationProviders.map((provider, index) => (
                    <li key={`${provider.provider}:${index}`}>
                      {providerLabel(provider.provider)} ·{" "}
                      {title(provider.status)}
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-7 font-semibold">Campaign Instances</h3>
              {selected.memberships.length === 0 ? (
                <p className="mt-2 text-sm text-base-content/55">
                  This Player has no Campaign Instance memberships.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {selected.memberships.map((membership) => (
                    <li
                      key={membership.membershipId}
                      className="rounded-box border border-base-300 bg-base-100 p-4"
                    >
                      <Link
                        to="/campaigns/instances/$campaignInstanceId/roster/members/$recordId"
                        params={{
                          campaignInstanceId: membership.campaignInstanceId,
                          recordId: membership.membershipId,
                        }}
                        className="inline-flex min-h-11 items-center font-semibold link link-hover"
                      >
                        {membership.campaignInstanceName}
                      </Link>
                      <p className="mt-1 text-xs text-base-content/50">
                        {membership.campaignDefinitionName} ·{" "}
                        {title(membership.status)}
                      </p>
                      {membership.characters.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {membership.characters.map((character) => (
                            <li key={character.characterId}>
                              <Link
                                to="/campaigns/instances/$campaignInstanceId/roster/characters/$characterId"
                                params={{
                                  campaignInstanceId:
                                    membership.campaignInstanceId,
                                  characterId: character.characterId,
                                }}
                                className="inline-flex min-h-11 items-center link link-hover"
                              >
                                {character.name}
                              </Link>{" "}
                              · {title(character.status)}
                              {character.importedFrom
                                ? ` · imported from ${character.importedFrom.characterName} in ${character.importedFrom.campaignInstanceName}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("-", " ");
}

function providerLabel(provider: string) {
  if (provider === "aow:invitation") return "Invitation onboarding";
  if (provider === "aow:bootstrap") return "First-launch identity";
  if (provider.startsWith("auth0:")) return "Auth0";
  return "Connected identity provider";
}
