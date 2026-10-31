# @mento/ui

Design tokens (`tokens.css`) and shared React components. Used by the whiteboard and the teacher UI so both read as one product: light beige paper, Mento blue, Nunito Sans UI (Stitch "Warm Paper Editorial"), Caveat handwriting on the board (docs/18-ui-references.md §6).

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
| Brand | `--mento-blue`, `--mento-blue-strong` (= `--mento-blue-hover`), `--mento-blue-soft`, `--mascot-blue`, `--mascot-light` (= `--decor`) |
| Accent | `--accent`, `--accent-soft`, `--accent-ink` (small highlights only) |
| Status | `--danger`, `--danger-soft` (destructive menu items), `--success` (resolved dots) |
| Board markers | `--marker-yellow`, `--marker-blue` |
| Radius | `--radius` (legacy), `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-input` (12px), `--radius-xl` (32px, floating sheets), `--radius-pill` |
| Shadow / focus | `--shadow-card`, `--shadow-float` (modal, drawer, menu), `--shadow-pop`, `--focus-ring` (2px paper + 3px `--decor`), `--overlay`, `--overlay-blur` |
| Motion | `--ease-out`, `--dur-fast`, `--dur-base`, `--dur-slow`, `--stagger` (all zeroed under `prefers-reduced-motion`) |
| Fonts | `--font-ui` (Nunito Sans, then Nunito), `--font-board` (Caveat, then Kalam) |

## Components

No hooks inside, so they render in Server and Client Components (pass event handlers only from Client Components).

| Component | Notes |
|---|---|
| `Button` | `variant` primary / secondary / ghost, `size` sm / md / lg, `loading` (spinner + `aria-busy`), `disabled`; native button props and `ref` |
| `IconButton` | Round, `aria-label` required; same variants; for the orb controls |
| `Chip` | `variant` source / outside / quick / status; a `<button>` when it has `onClick`, otherwise a `<span>`; `outside` defaults to "Fora do material" |
| `Card` | Raised card; `interactive` renders a `<button>` with hover lift, `selected` adds the blue outline (`aria-pressed`, omitted when `selected` is undefined, e.g. navigation cards) |
| `Badge`, `SimulatedDataBadge` | neutral / info / warning; "Dados simulados" is required wherever invented data is shown (AGENTS.md rule 4) |
| `Spinner`, `VisuallyHidden`, `cx` | Helpers |
| `Button inert`, `IconButton inert`, `InertButton` | Drawn but not wired (plan §6): focusable, `aria-disabled="true"`, "Em breve" tooltip on hover/focus, click does nothing. `inertProps()` / `inertClasses` do the same for other elements |
| `Avatar` | Initials (`initials()`), `size` sm / md / lg, `decorative` when the name is printed next to it; no photos |
| `TopBar` | Student header: logo, `nav` (`{label, href?, active?, inert?}`), `classLabel` chip, `studentName` + avatar, `studentAction` slot (e.g. "Trocar aluno"), `sticky` |
| `Footer` | Static student footer (tagline + handwritten "Caderno de Estudos") |
| `Icon*` | Inline Lucide-style SVG icons (`icons.tsx`), `aria-hidden`; no icon font |

Client components (`"use client"`, hooks): `Modal` (centered card), `Drawer` (right sheet with `eyebrow`, `toolbar`, `footer`) and `Menu` (popover from an icon trigger; items with `icon`, `description`, `tone="danger"`, `inert`, `separatorBefore`). Modal and Drawer are `role="dialog"` + `aria-modal`, trap Tab, close on Escape, lock page scroll and return focus to the opener; they render in place (no portal), so mount them outside transformed or clipped ancestors. Menu follows the menu-button pattern (arrows, Home/End, Escape, Tab, click outside). `LoadingOverlay` (S2 "Preparando sua aula") takes real `stages` (pending / active / done), an indeterminate bar and an optional `slowNotice`; motion stops under reduced motion. Gallery: `/dev/ui/stitch`.

## Orb (client component)

`Orb` is the student's voice orb: the mascot as the face and a ring drawn in SVG (no Three.js, D26). It is a `"use client"` component (hooks, rAF); import it only from Client Components. Playground: `/dev/orb`.

```tsx
<Orb state="speaking" getLevel={() => analyserLevel()} perkKey={selectionId} burstKey={correctCount} />
```

| Prop | Notes |
|---|---|
| `state` | `idle` / `listening` / `thinking` / `speaking` / `waiting` / `paused` / `loading` (`OrbState`) |
| `size` | Diameter in px, default 176 (design range 160–200) |
| `getLevel` | `() => number` 0..1, read every animation frame in `listening` and `speaking` (mic or TTS level); never triggers a render, so keep it cheap and stable |
| `perkKey` | Change it to "perk up" (scale 1.06, 180 ms), e.g. on click-and-ask |
| `burstKey` | Change it for the correct-answer burst (ring pulse + `--mascot-light` sparkles, ~700 ms) |
| `label` | Optional visible caption (visual only; a hidden pt-BR label always names the state) |
| `announce` | Default `true`: owns a polite `role="status"` that announces only thinking / speaking / waiting, debounced 400 ms. Set `false` on every orb but one on a screen |
| `basePath` | Brand folder, default `/brand` (faces: `mascot/{float,thinking,speaking,spin}.gif`, `mascot.png`) |

Faces per state follow docs/19-brand-assets.md §4 (`orbFace()`); all faces are stacked and preloaded and switch by a 200 ms opacity crossfade (never a `src` swap). Under `prefers-reduced-motion` every state shows the static `mascot.png`, no loop runs and perk/burst do nothing; each state keeps a static ring cue (`orbRingCue()`): a fixed arc for thinking/loading, a dashed ring for waiting, a stronger ring with glow for listening/speaking, a dimmed ring for paused. The loop pauses while the tab is hidden and stops on unmount. Pure helpers (`orbFace`, `orbFaceSrc`, `orbStateLabels`, `ORB_STATES`) are exported for callers and tests.
