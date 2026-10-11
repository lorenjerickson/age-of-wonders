import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ShellToolsTarget } from "./shellToolsContext";

/** Keep task content in its workspace while disclosing supporting tools in the shell. */
export function ShellTools({ children }: { children: ReactNode }) {
  const target = useContext(ShellToolsTarget);
  return target ? createPortal(children, target) : null;
}
