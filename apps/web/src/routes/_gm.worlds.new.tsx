import { useState, type FormEvent } from "react";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { Alert, Button, Field, Input, Textarea } from "@aow/ui";
import { createWorldDefinitionDraft } from "../api";
import { RouterButtonLink, useInternalNavigate } from "../navigation";
import { quickStartSuffix } from "../quickStartModel";
import { worldCreationInput } from "../worldAuthoringModel";

export const Route = createFileRoute("/_gm/worlds/new")({
  component: NewWorldRoute,
});

function NewWorldRoute() {
  const navigate = useInternalNavigate();
  const guideSuffix = quickStartSuffix(useLocation().searchStr);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await createWorldDefinitionDraft(
        worldCreationInput(name, description),
      );
      await navigate(`/worlds/${encodeURIComponent(result.id)}${guideSuffix}`);
    } catch {
      setError("The World draft could not be created. No World was published.");
      setSaving(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-6 py-14 lg:px-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        World library
      </p>
      <h1 className="mt-3 text-4xl font-semibold">Create World</h1>
      <p className="mt-4 text-base-content/65">
        Create a lineage and an unpublished working revision. Nothing becomes
        available to Campaign authoring until you review and publish it.
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-8 grid gap-5"
      >
        <Field label="World name" required>
          <Input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full"
          />
        </Field>
        <Field label="Description">
          <Textarea
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 w-full"
          />
        </Field>
        {error && (
          <Alert tone="error" aria-live="polite">
            {error}
          </Alert>
        )}
        <Button
          type="submit"
          tone="primary"
          loading={saving}
          disabled={saving || !name.trim()}
        >
          Create working draft
        </Button>
        {!saving && (
          <RouterButtonLink className="min-h-11" href={`/worlds${guideSuffix}`}>
            Cancel
          </RouterButtonLink>
        )}
      </form>
    </main>
  );
}
