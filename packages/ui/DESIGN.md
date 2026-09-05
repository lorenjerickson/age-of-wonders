# Age of Wonders UI design system

`@aow/ui` is the single source of truth for interactive controls. It wraps DaisyUI semantics in a small React API so screens express intent (`tone="primary"`, `error=...`) instead of assembling visual class strings.

## Direction

The interface should feel like a quiet, modern game-master's desk: near-black violet surfaces, warm parchment text, gold for the main action, oxidized copper for secondary emphasis, and restrained green/blue/red semantic colors. Depth comes from surface steps and borders rather than decorative gradients. Motion is brief and functional.

## Usage

Import the stylesheet once at the application entry point:

```ts
import "@aow/ui/styles.css";
```

Then import components from the package root:

```tsx
import { Button, Checkbox, CompactInput, SelectField, TextInput } from "@aow/ui";
```

Use `TextInput`, `TextareaField`, `SelectField`, and `FileInputField` for ordinary forms. Their label is above the control and help or error text is below it. Use `CompactInput` only in dense inspectors and toolbars; it places the short label inside the input boundary.

## Component rules

- One primary button per decision area. Secondary preserves emphasis; neutral is ordinary; ghost is for low-emphasis toolbar actions; danger is destructive.
- Icon-only buttons always need an accessible `aria-label` and tooltip/title where the symbol may be unfamiliar.
- Help text explains how to succeed. Error text replaces help text and is connected through `aria-describedby`.
- Checkbox describes a set membership or independent choice. Toggle changes an immediately applied setting. Radio selects one option from a visible group. Select is for a longer closed list.
- Badges classify content; chips are outlined, lightweight metadata. `StatusIndicator` reports live/system state with a dot plus text, never color alone.
- `Disclosure` owns expand/collapse structure and keyboard behavior. Domain content belongs inside it.
- `RichTextEditor` supports headings, emphasis, lists, and quotes. It sanitizes on blur. The current `execCommand` implementation preserves existing behavior and should be upgraded separately from screen migrations.

## Composition and escape hatches

Domain-specific cards, forms, and inspectors remain in the application but must assemble these primitives. `className` is available for placement and sizing; do not use it to override colors, radii, borders, or interaction states. Add a package variant when a visual distinction repeats or communicates meaning.

## Accessibility contract

Controls retain their native HTML props. Field composites generate stable IDs and connect label, help, and error text. Focus styling comes from DaisyUI. State indicators include text. Reduced-motion preferences collapse animation durations. Do not place opaque database identifiers in labels, options, alerts, or empty states.

## Token ownership

Machine-readable values live in `design-tokens.json`; runtime values live in `src/styles.css`. Keep them synchronized. The theme deliberately preserves the established application palette and the enlarged type ramp already used by the web client.
