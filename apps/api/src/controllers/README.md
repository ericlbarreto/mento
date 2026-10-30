# controllers

Thin request handlers, one file per resource: `<name>.controller.ts` exporting async functions. A route file (`routes/<name>.ts`) declares the path + Zod schema and points at the controller:

```ts
app.get("/health", { schema: { response: { 200: HealthResponse } } }, getHealth);
```

Flow: `routes/` (HTTP + schema) → `controllers/` (request in, data out) → `services/` (logic) → models in `@mento/db`.
