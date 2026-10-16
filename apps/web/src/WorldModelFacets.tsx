import type { ReactNode } from "react";

/** Legacy Model URLs remain readable, without exposing World definition-editing navigation. */
export function WorldModelFacets({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
