# @mento/ui

Design tokens (`tokens.css`) and shared React components. Used by the whiteboard and the teacher UI so both read as one product: light beige paper, Mento blue, rounded Nunito UI, Caveat handwriting on the board (docs/18-ui-references.md §6).

- **Owner:** Person 2
- **Allowed workspace deps:** none (see docs/21-repo-structure.md §4); runtime peer dep: `react` only.
- Import from `@mento/ui` only; no deep imports. Tokens are loaded once in `apps/web/src/app/layout.tsx` (`@mento/ui/tokens.css`, which also loads the Google Fonts).
- Visual catalog: `/dev/ui` in the web app. Add every new component there with all its states.

## Tokens

CSS variables on `:root`; use them with Tailwind v4 arbitrary syntax, e.g. `bg-(--paper)`, `text-(--ink-soft)`, `rounded-(--radius-lg)`, `shadow-(--shadow-card)`, `duration-(--dur-base) ease-(--ease-out)`.

| Group | Tokens |
|---|---|
| Surfaces | `--paper`, `--paper-2`, `--card`, `--line` |
| Text | `--ink`, `--ink-soft` (AA on beige), `--mento-navy` |
| Brand | `--mento-blue`, `--mento-blue-strong`, `--mento-blue-soft`, `--mascot-blue`, `--mascot-light` |
| Accent | `--accent`, `--accent-soft`, `--accent-ink` (small highlights only) |
| Board markers | `--marker-yellow`, `--marker-blue` |
| Radius | `--radius` (legacy), `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` |
| Shadow / focus | `--shadow-card`, `--shadow-pop`, `--focus-ring` |
| Motion | `--ease-out`, `--dur-fast`, `--dur-base`, `--dur-slow`, `--stagger` (all zeroed under `prefers-reduced-motion`) |
| Fonts | `--font-ui` (Nunito), `--font-board` (Caveat, then Kalam) |

## Components

No hooks inside, so they render in Server and Client Components (pass event handlers only from Client Components).

| Component | Notes |
|---|---|
| `Button` | `variant` primary / secondary / ghost, `size` sm / md / lg, `loading` (spinner + `aria-busy`), `disabled`; native button props and `ref` |
| `IconButton` | Round, `aria-label` required; same variants; for the orb controls |
| `Chip` | `variant` source / outside / quick / status; a `<button>` when it has `onClick`, otherwise a `<span>`; `outside` defaults to "Fora do material" |
| `Card` | Raised card; `interactive` renders a `<button>` with hover lift, `selected` adds the blue outline (`aria-pressed`) |
| `Badge`, `SimulatedDataBadge` | neutral / info / warning; "Dados simulados" is required wherever invented data is shown (AGENTS.md rule 4) |
| `Spinner`, `VisuallyHidden`, `cx` | Helpers |
