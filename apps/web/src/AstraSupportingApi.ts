export interface WorldAccessEntry {
  id: string;
  playerId: string;
  displayName: string;
  role: "viewer" | "editor";
  revision: number;
}

export async function worldAccessRequest<T>(
  worldId: string,
  method = "GET",
  input?: unknown,
  entryId?: string,
): Promise<T> {
  const response = await fetch(
    `/api/worlds/${encodeURIComponent(worldId)}/access${entryId ? `/${encodeURIComponent(entryId)}` : ""}`,
    {
      method,
      credentials: "include",
      ...(input === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 409
        ? "Access changed elsewhere. Refresh the list and try again."
        : response.status === 403
          ? "Only the world owner can manage access."
          : "Access could not be updated. Try again.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
