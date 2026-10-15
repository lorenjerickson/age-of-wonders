/** Shared authoring access; an active Player profile is required for explicit sharing. */
export function worldAccessWhere(userId: string, write = false) {
  return {
    OR: [
      { ownerUserId: userId },
      {
        accessEntries: {
          some: {
            ...(write ? { role: "editor" } : {}),
            player: { userId, standing: "ACTIVE" as const },
          },
        },
      },
    ],
  };
}
