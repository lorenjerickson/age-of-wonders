import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, FieldError, Select, TextInput } from "@aow/ui";
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

function PlayersLanding() {
  const [directory, setDirectory] = useState<PlayerDirectoryProjection>();
  const [selected, setSelected] = useState<PlayerDetailProjection>();
  const [search, setSearch] = useState("");
  const [standing, setStanding] = useState<PlayerServerStanding | "all">("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setMessage("");
    try {
      setDirectory(
        await listPlayers({
          q: search.trim() || undefined,
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

  async function inspect(playerId: string) {
    setBusy(`detail:${playerId}`);
    setMessage("");
    try {
      setSelected(await getPlayer(playerId));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Player could not be loaded.",
      );
    } finally {
      setBusy("");
    }
  }

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
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        People
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Players</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-base-content/65">
        Server-wide profiles and standing live here. Invitations, memberships,
        Characters, and attendance remain in their Campaign Instance or Session.
      </p>

      <form
        className="mt-8 grid gap-4 rounded-box border border-base-300 bg-base-200 p-5 md:grid-cols-[1fr_13rem_auto] md:items-end"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void load();
        }}
      >
        <TextInput
          label="Search by name"
          maxLength={120}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <label className="form-control">
          <span className="label-text mb-2 text-sm font-medium">Standing</span>
          <Select
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
          </Select>
        </label>
        <Button type="submit" tone="primary">
          Apply
        </Button>
      </form>

      {message && (
        <div className="mt-5">
          <FieldError>{message}</FieldError>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <section className="overflow-hidden rounded-box border border-base-300 bg-base-100">
          <div className="border-b border-base-300 px-5 py-4 text-sm text-base-content/55">
            {directory
              ? `${directory.total} ${directory.total === 1 ? "Player" : "Players"}`
              : "Loading Players…"}
          </div>
          {directory?.items.length === 0 && (
            <p className="px-5 py-10 text-center text-base-content/55">
              No Player profiles match these filters. Profiles are created when
              a Player accepts an Instance invitation.
            </p>
          )}
          <ul className="divide-y divide-base-300">
            {directory?.items.map((player) => (
              <li
                key={player.playerId}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div>
                  <p className="font-semibold">{player.displayName}</p>
                  <p className="mt-1 text-sm text-base-content/55">
                    {title(player.standing)} · {player.membershipCount}{" "}
                    {player.membershipCount === 1
                      ? "membership"
                      : "memberships"}{" "}
                    · {player.characterCount}{" "}
                    {player.characterCount === 1 ? "Character" : "Characters"}
                  </p>
                </div>
                <Button
                  type="button"
                  tone="ghost"
                  loading={busy === `detail:${player.playerId}`}
                  onClick={() => void inspect(player.playerId)}
                >
                  View
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-box border border-base-300 bg-base-200 p-5">
          {!selected ? (
            <p className="text-sm leading-6 text-base-content/55">
              Select a Player to review contact methods, identity-provider
              status, Instance memberships, and Character history.
            </p>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Player profile
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {selected.displayName}
                  </h2>
                </div>
                <Select
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
                        to="/campaigns/instances/$campaignInstanceId"
                        params={{
                          campaignInstanceId: membership.campaignInstanceId,
                        }}
                        className="font-semibold link link-hover"
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
                              {character.name} · {title(character.status)}
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
