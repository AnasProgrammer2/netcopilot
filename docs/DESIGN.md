# NetCopilot visual system

NetCopilot is a tool people stare at for hours while something is broken. The
interface has one job: keep attention on the terminal and on the few things
that need a decision. These rules exist to protect that.

## Principles

1. **Colour is a signal, not decoration.** Colour is processed pre-attentively
   — the eye finds it before reading anything. That only works if it is rare
   (the isolation / von Restorff effect). Neutral greys carry the interface; colour marks
   the few elements that need the engineer.
2. **Mark the exception, not the normal.** A connected session, a successful
   command, a production device (the default) get no colour. A dropped
   session, a pending approval or a risky change do.
3. **Fewer visible choices.** Every extra control on screen slows the choice
   between the ones that matter (Hick's law). Secondary actions live in menus or
   tooltips; a view has at most one filled (primary) button.
4. **Hierarchy through size and weight, not boxes.** Spacing and alignment
   group things (Gestalt proximity). No box inside a box inside a box, no
   gradients, no glows.
5. **Everything readable.** All text meets WCAG 2.1 AA (≥ 4.5:1) on every
   surface, in both themes.

## Colour

| Token | Use | Never for |
|---|---|---|
| `foreground` | Primary text | — |
| `muted-foreground` | Secondary text, idle icons | — |
| `subtle` | Tertiary text: metadata, placeholders, captions | Anything the user must read to act |
| `primary` | The one primary button per view, focus ring, selection, ARIA mark | Status, decoration, hover backgrounds |
| `warning` | Needs the engineer: pending approval, risky change, slow link | "Information" |
| `danger` | Failed, blocked, error, destructive risk | Neutral resets, "Skip" |
| `success` | Rare confirmation of an action the user just took (e.g. "Saved") | Normal/healthy state |
| `destructive` | Solid fill for a destructive button (white text) | Text |

Measured contrast (dark theme, on the app background): foreground 15:1,
muted-foreground ≈ 6.5:1, subtle ≈ 4.6:1. Light theme values are tuned to the
same targets. Do **not** use opacity on text tokens (`text-muted-foreground/50`
drops below 2.5:1) — pick one of the three levels instead.

The accent colour is user-selectable. `applyAccentColor` keeps the chosen hue
but picks a shade that keeps white button text at ≥ 4.5:1.

User data colours (group colours, a connection colour chosen on purpose) are
shown as a small dot or icon tint — never as backgrounds.

## Type

Five sizes, two weights.

| Class | Size / line | Use |
|---|---|---|
| `text-2xs` | 11 / 15 | Badges, captions, metadata (smallest allowed) |
| `text-xs` | 12 / 16 | Secondary UI text, buttons in dense areas |
| `text-sm` | 13 / 19 | Default UI and chat text |
| `text-base` | 15 / 22 | Section titles |
| `text-lg`–`text-2xl` | 17–24 | Dialog and page titles |

Weights: regular for text, `font-medium` for labels and buttons,
`font-semibold` for titles. No bold, no arbitrary `text-[Npx]`.

## Shape and effects

- Radius: `rounded-md` (6px) for controls, `rounded-lg` (8px) for cards and
  dialogs, `rounded-xl` (12px) only for large surfaces, `rounded-full` for dots.
- Elevation: shadows only on things that float (menus, dialogs, toasts).
- Motion: spinners for work in progress, `animate-pulse` only for a live state
  that needs attention. No decorative animation.

## Components

- **Status dots** appear only for non-normal states (connecting, error,
  disconnected). Connected is the default and is unmarked.
- **Environment tags** (PROD / STG / LAB) are neutral outlines — they are
  information. Risk is shown on the change itself.
- **ARIA chat**: no avatars; the engineer's message is a neutral bubble on the
  right, ARIA's answer is plain text. Commands are one neutral row; only a
  command waiting for approval gets an amber border.
- **Toolbars**: icon-only with a tooltip, except the single labelled entry
  point (ARIA).
