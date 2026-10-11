import type { CampaignDefinitionList, CampaignInstanceList } from "./api";
import {
  campaignDefinitionCard,
  campaignInstanceCard,
  type CampaignLibraryCard,
} from "./campaignLibraryModel";
import { InternalLink } from "./navigation";
import type { ReadSection } from "./server/readModels";
import { useMemo, useState } from "react";
import { Disclosure, Button, Input, Label, Select } from "@aow/ui";

export function CampaignLibraryPage({
  definitions,
  instances,
  quickStartSuffix = "",
}: {
  definitions: ReadSection<CampaignDefinitionList>;
  instances: ReadSection<CampaignInstanceList>;
  quickStartSuffix?: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("current");
  const definitionCards = useMemo(
    () =>
      filterCards(
        definitions.ok
          ? definitions.data.items.map(campaignDefinitionCard)
          : [],
        query,
        status,
      ),
    [definitions, query, status],
  );
  const instanceCards = useMemo(
    () =>
      filterCards(
        instances.ok ? instances.data.items.map(campaignInstanceCard) : [],
        query,
        status,
      ),
    [instances, query, status],
  );
  return (
    <main className="mx-auto w-full max-w-none px-4 py-6 sm:p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
      <p className="mt-5 text-base-content/65">
        Create and manage campaign definitions
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
        <InternalLink
          className="btn btn-primary min-h-11 sm:min-w-52"
          href={`/campaigns/definitions/new${quickStartSuffix}`}
        >
          + Create campaign
        </InternalLink>
        <Button
          tone="outline"
          className="min-h-11 sm:min-w-52"
          aria-expanded={filtersOpen}
          aria-controls="campaign-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Search / Filter
        </Button>
      </div>
      {filtersOpen && (
        <div
          id="campaign-filters"
          className="mt-5 grid gap-4 rounded-box border border-base-300 bg-base-200 p-4 sm:grid-cols-[minmax(0,1fr)_14rem]"
        >
          <Label>
            Search Campaigns
            <Input
              type="search"
              className="mt-2 w-full"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search by name, World, or revision"
            />
          </Label>
          <Label>
            Status
            <Select
              className="mt-2 w-full"
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value)}
            >
              <option value="current">Current</option>
              <option value="all">All</option>
              <option value="archived">Archived</option>
            </Select>
          </Label>
        </div>
      )}
      <CampaignSection
        id="campaign-definitions"
        eyebrow="Authoring"
        title="Definitions"
        description="Prepare plots and content against an explicitly captured World revision."
        cards={definitionCards}
        empty="No Campaign Definitions are available yet."
        error={definitions.ok ? undefined : definitions.message}
        quickStartSuffix={quickStartSuffix}
      />
      <p className="mt-5 rounded-box border border-base-300 p-4 text-sm text-base-content/65">
        GM only · Campaign definitions prepare stories for later play.
      </p>
      <Disclosure
        className="mt-6 rounded-box border border-base-300 p-4"
        summary="Played campaigns · Instances"
      >
        <CampaignSection
          id="campaign-instances"
          createHref={`/campaigns/instances/new${quickStartSuffix}`}
          createLabel="Create Campaign Instance"
          eyebrow="Instance management"
          title="Instances"
          description="Manage each played realization and its captured compatible Campaign and World revisions."
          cards={instanceCards}
          empty="No Campaign Instances are available yet."
          error={instances.ok ? undefined : instances.message}
          quickStartSuffix={quickStartSuffix}
        />
      </Disclosure>
    </main>
  );
}

function CampaignSection({
  id,
  eyebrow,
  title,
  description,
  cards,
  empty,
  error,
  quickStartSuffix,
  createHref,
  createLabel,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  cards: readonly CampaignLibraryCard[];
  empty: string;
  error?: string;
  quickStartSuffix: string;
  createHref?: string;
  createLabel?: string;
}) {
  return (
    <section className="mt-5" aria-labelledby={`${id}-heading`}>
      <p className="sr-only">{eyebrow}</p>
      <div
        className={
          id === "campaign-definitions"
            ? "sr-only"
            : "mt-2 flex flex-wrap items-center justify-between gap-4"
        }
      >
        <h2 id={`${id}-heading`} className="text-2xl font-semibold">
          {title}
        </h2>
        {createHref && createLabel && (
          <InternalLink className="btn btn-outline min-h-11" href={createHref}>
            {createLabel}
          </InternalLink>
        )}
      </div>
      <p className="sr-only">{description}</p>
      {error ? (
        <div className="alert alert-error mt-6 max-w-3xl">
          <div>
            <p>{error}</p>
            <InternalLink className="link mt-2 inline-block" href="/campaigns">
              Try loading this section again
            </InternalLink>
          </div>
        </div>
      ) : cards.length ? (
        <div className="space-y-4">
          {cards.map((card) => (
            <CampaignCard
              key={card.key}
              card={card}
              quickStartSuffix={quickStartSuffix}
            />
          ))}
        </div>
      ) : (
        <div className="alert mt-6 max-w-3xl border border-base-300 bg-base-200">
          <span>{empty}</span>
        </div>
      )}
    </section>
  );
}

function CampaignCard({
  card,
  quickStartSuffix,
}: {
  card: CampaignLibraryCard;
  quickStartSuffix: string;
}) {
  return (
    <article className="rounded-box border border-base-300 bg-base-100">
      <div className="space-y-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold">{card.name}</h3>
          <span className="badge badge-outline shrink-0">
            {card.statusLabel}
          </span>
        </div>
        {card.description && (
          <p className="line-clamp-3 text-sm leading-6 text-base-content/60">
            {card.description}
          </p>
        )}
        <div className="mt-3 space-y-1 text-sm text-base-content/55">
          <p>{card.primaryMetadata}</p>
          <p>{card.secondaryMetadata}</p>
        </div>
        {card.contextLabels.length > 0 && (
          <ul className="mt-3 space-y-2">
            {card.contextLabels.map((label) => (
              <li key={label} className="text-sm font-medium text-primary">
                {label}
              </li>
            ))}
          </ul>
        )}
        <div className="card-actions mt-4">
          <InternalLink
            className="btn btn-outline min-h-11"
            href={`${card.href}${card.actionLabel === "Open Definition" && card.contextLabels.some((label) => label.startsWith("Working draft")) ? "/plots" : ""}${quickStartSuffix}`}
          >
            {card.actionLabel === "Open Definition" &&
            card.contextLabels.some((label) =>
              label.startsWith("Working draft"),
            )
              ? "Open plots"
              : card.actionLabel}
          </InternalLink>
        </div>
      </div>
    </article>
  );
}

function filterCards(
  cards: readonly CampaignLibraryCard[],
  query: string,
  status: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  return cards.filter((card) => {
    const archived = card.statusLabel.toLocaleLowerCase() === "archived";
    if (status === "archived" && !archived) return false;
    if (status === "current" && archived) return false;
    return (
      !normalized ||
      [
        card.name,
        card.description,
        card.primaryMetadata,
        card.secondaryMetadata,
        ...card.contextLabels,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized)
    );
  });
}
