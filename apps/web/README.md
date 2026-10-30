# @mento/web — Next.js frontend (UI only)

No API routes here: all data comes from `apps/api` (`NEXT_PUBLIC_API_URL`). Route groups:

| Path | Who | Notes |
|---|---|---|
| `/` (`(student)/page.tsx`) | Person 2 | Start screen (pick student + material) |
| `/session/[id]` | Person 2 | Whiteboard |
| `/professor` | Person 1 | Students tab |
| `/professor/materiais` | Person 1 | Materials tab |

Brand files are in `public/brand/` (logo, mascot, symbol, `mascot/{spin,float,thinking,speaking}.gif`). Tokens: `@mento/ui/tokens.css`.

```bash
pnpm dev:web   # http://localhost:3000
```
