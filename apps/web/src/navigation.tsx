import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useCallback, type AnchorHTMLAttributes, type ReactNode } from "react";

type InternalLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string;
};

/**
 * Router-native bridge for legacy screens whose destinations are assembled from
 * API-owned resource identifiers. Static application navigation should use
 * TanStack's typed Link directly.
 */
export function InternalLink({ href, ...props }: InternalLinkProps) {
  return <Link to={href as LinkProps["to"]} {...props} />;
}

export function RouterButtonLink({
  href,
  tone,
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...props
}: InternalLinkProps & {
  tone?:
    | "primary"
    | "secondary"
    | "accent"
    | "neutral"
    | "ghost"
    | "outline"
    | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  fullWidth?: boolean;
  children?: ReactNode;
}) {
  const tones = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    accent: "btn-accent",
    neutral: "btn-neutral",
    ghost: "btn-ghost",
    outline: "btn-outline",
    danger: "btn-error",
  } as const;
  const sizes = { xs: "btn-xs", sm: "btn-sm", md: "", lg: "btn-lg" } as const;

  return (
    <InternalLink
      href={href}
      className={[
        "btn",
        tone ? tones[tone] : "",
        sizes[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </InternalLink>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInternalNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (href: string, options: { replace?: boolean } = {}) =>
      navigate({ to: href as LinkProps["to"], replace: options.replace }),
    [navigate],
  );
}
