# 19 — Brand assets (logo, mascot, colors) and how the product uses them

> Status: **decided by the founder** (logo) with **proposals** for usage. Files live in `assets/` (`assets/README.md`). Colors below were **sampled from the actual files** (approximate, to be confirmed by the designer). Last updated: 2026-10-30.
> Resolves the mascot/logo question (Q11 in `10-decisions.md`) and feeds `18-ui-references.md`.

## 1. What exists

| File | What it is | Notes |
|---|---|---|
| `assets/brand/logo.png` | **Chosen logo**: a flowing blue "m" symbol (a wave/path that also reads as a learning path) + navy lowercase `mento` wordmark | Copy of `logo-05-learning-path.png`; 1774×887 PNG, transparent background |
| `assets/brand/logo-symbol.png`, `logo-symbol-512.png`, `apple-touch-icon.png`, `favicon-32.png` | **Symbol-only exports** of the wave "m", cropped programmatically from `logo.png` (symbol bounding box 362×209 px, 6% padding); the 512 version is centered on a transparent square | Raster, so no vector scaling; fine for favicon/avatar |
| `assets/brand/mascot.png` | **Mascot**, neutral pose: a round blue character with a dark-navy wavy tuft (the hair forms an "M" shape), big white eyes, small smile, light-blue belly and two rounded hands | Copy of `mascot-animation-source.png`; 1254×1254 PNG, transparent |
| `assets/brand-concepts/mascot-concept.png` | Pose sheet: neutral, surprised/listening (orange spark marks), thinking (hand on chin), happy/wink | 1536×1024, dark background; **expression reference** |
| `assets/brand-concepts/mascot-gifs/` | Four animated loops: `01-spin`, `02-float-orbit`, `03-thinking-wobble`, `04-speaking-pulse` | 512×512, 40 frames, 2 s, **transparent**, 0.8–1.1 MB each |
| `assets/brand-concepts/logo-01…04` | Rejected logo explorations (continuous M, modular M, plain wordmark, orb "o") | Archive only |

**Gaps to know about**
- Everything is **raster (PNG/GIF)**. There is **no SVG** of the logo or mascot.
- The symbol-only and icon files are **raster crops** of `logo.png` (no SVG); the symbol is wide (about 1.7:1), so it sits small inside square icons.
- No **dark-background** logo (the navy wordmark disappears on dark backgrounds). We use light backgrounds, so this is not a blocker.
- The mascot GIF mapping to states below is **by file name**; the animations were not reviewed frame by frame.
- The origin of the assets (e.g., if generated with an AI tool) and **trademark availability of "Mento"** (Q10) are **not verified**; check the tool's terms and INPI before any public use beyond the hackathon.

## 2. Color tokens (sampled from the files)

| Token | Value | Source |
|---|---|---|
| `--mento-blue` (primary) | `#1E59ED` | Logo symbol |
| `--mento-navy` (ink, headings) | `#162250` | Logo wordmark |
| `--mascot-blue` | `#126CFC` | Mascot body |
| `--mascot-navy` | `#0C2056` | Mascot hair/eyes |
| `--mascot-light` | `#B1D8FA` | Mascot belly/highlights |
| `--accent-orange` | `#FC724A` | Spark marks in the pose sheet (approximate) |

Neutrals (beige-light direction, 2026-10-30): paper `#FBF7EE`, panels `#F5EEDF`, cards `#FFFDF8`, line `#E7DECB`; full token list and the animation plan in `18-ui-references.md` §6. Use the orange only for small highlights/alerts, never as a large surface.

## 3. Logo usage

- **Full logo** (symbol + wordmark): login/start screen, teacher sidebar header, README, pitch.
- **Symbol only** (`logo-symbol.png`): small headers, loading states, social avatar. Icon sizes: `favicon-32.png`, `apple-touch-icon.png` (180), `logo-symbol-512.png`.
- **Minimum clear space** = height of the `m` stroke; minimum width ~96 px for the full logo.
- Light backgrounds only. Do not recolor, stretch or add effects.
- Teacher UI header: full logo at the top of the left sidebar (replaces the placeholder in `18` §4.1).

## 4. Mascot usage and the voice orb

The student interface's bottom-center **orb** (see `18` §3) uses the **mascot as its face** with a **ring/wave drawn around it in code**.

| Orb state | Mascot asset | Ring |
|---|---|---|
| Idle | `02-float-orbit.gif` (floating) | Slow breathing |
| Listening | `02-float-orbit.gif` (or the neutral `mascot.png`) | **Driven by mic amplitude** (Web Audio `AnalyserNode`) |
| Thinking | `03-thinking-wobble.gif` | Rotating arc |
| Speaking | `04-speaking-pulse.gif` | **Driven by TTS output amplitude** (stub: caption progress) |
| Waiting for answer | `02-float-orbit.gif` | Soft pulse |
| Paused / muted | `mascot.png` (static) | Dimmed |
| Loading / splash | `01-spin.gif` | — |
| `prefers-reduced-motion` | `mascot.png` (static) for every state | Static ring |

**Implementation notes**
- Preload all GIFs as stacked `<img>` elements and **toggle opacity** between states; swapping `src` makes the animation restart and flicker.
- Render the mascot at 160–200 px (GIFs are 512×512). Each GIF is ~1 MB: acceptable for a laptop demo; if load time matters, convert to animated WebP/APNG/WebM-with-alpha (optional, not required).
- There is **no "listening" animation**. For the demo, reuse idle + the amplitude-driven ring; if we want a dedicated one, use the "surprised/listening" pose in `mascot-concept.png` as the reference for a new loop.
- The ring is plain Canvas/SVG (no Three.js), as decided in D26.
- Expressions in the pose sheet can later map to feedback moments: **happy/wink** for a correct answer, **thinking** for a hard question. Not needed for the hackathon.

## 5. Where the files go in the app

| Need | File | In app |
|---|---|---|
| Logo in headers/start screen | `assets/brand/logo.png` | `apps/web/public/brand/logo.png` |
| Orb face and static state | `assets/brand/mascot.png` | `apps/web/public/brand/mascot.png` |
| Orb animations | `assets/brand-concepts/mascot-gifs/*.gif` | `apps/web/public/brand/mascot/{spin,float,thinking,speaking}.gif` (renamed, lowercase) |
| Favicon / app icons | `assets/brand/favicon-32.png`, `apple-touch-icon.png`, `logo-symbol-512.png` | `apps/web/src/app/icon.png` (use the 512), `apps/web/src/app/apple-icon.png` (use the 180), `public/favicon-32.png` |
| Teacher header | `logo.png` | via `next/image` |

Copying and renaming is part of **kickoff K9** (`17-work-split.md`), done once by Lane A; nobody edits `assets/brand/`.

## 6. Open items (owner: founder unless noted)

1. SVG versions of the logo symbol and mascot (nice to have; PNG is enough for the demo).
2. ~~Symbol-only export and favicon~~ **Done** (raster crops); an SVG redraw is still nice to have.
3. Confirm the sampled colors and fonts with the designer; pick the UI typeface that matches the rounded geometric wordmark (proposal: **Nunito**).
4. A dedicated "listening" mascot loop (optional).
5. Usage rights of the assets and trademark check for "Mento" (Q10).
