# assets/

Brand and design source files. **Source of truth for the brand**; the app uses copies in `apps/web/public/brand/` (see `docs/19-brand-assets.md`).

```
assets/
  brand/                     ← canonical files to use
    logo.png                 ← chosen logo (wave "m" + "mento" wordmark); copy of logo-05
    mascot.png               ← mascot, neutral pose, transparent background; copy of mascot-animation-source
    logo-symbol.png          ← symbol only (the wave "m"), tight crop of logo.png, transparent
    logo-symbol-512.png      ← symbol centered on a 512×512 transparent square (app icon, social avatar)
    apple-touch-icon.png     ← 180×180 version
    favicon-32.png           ← 32×32 version
  brand-concepts/            ← all explored concepts and the animated mascot (kept as archive/source)
    logo-01 … logo-05        ← logo explorations (only logo-05 was chosen)
    mascot-concept.png       ← mascot poses sheet (dark background, expressions)
    mascot-animation-source.png
    mascot-gifs/             ← 512×512 transparent GIFs, 40 frames, 2 s loops
      01-spin.gif · 02-float-orbit.gif · 03-thinking-wobble.gif · 04-speaking-pulse.gif
```

Rules:
- Do not edit or rename files in `brand/` without the founder's approval.
- Do not import from `assets/` in code; copy what is needed into `apps/web/public/brand/` (Lane A, kickoff K9).
- Keep the repo light: new large binaries go in `brand-concepts/` only if they are real brand assets.
