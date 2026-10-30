# models

One file per collection, named `<entity>.model.ts`, exported from `index.ts`. **Each person models their own area** (docs/21 §9):

| Person | Collections (suggested) |
|---|---|
| 1 | `student`, `material`, `chunk`, `class-context`, `insight`, `analysis` |
| 3 | `session`, `event`, `evidence` |

Rules:
- Use `baseSchemaOptions` from `../schema-options` (timestamps, `id: string` in JSON, no `__v`).
- Field names are `snake_case` and must match `workstreams/contracts-spec.md`; validate inputs with the Zod schemas from `@mento/contracts`, not with Mongoose validators.
- Ids exposed to contracts are strings; relations store `ObjectId` (`Schema.Types.ObjectId`, `ref`).
- Search over page text: a text index with Portuguese, e.g. `chunkSchema.index({ text: "text" }, { default_language: "portuguese" })`.
- Do not import models from `apps/web`; models are server-only.

Template:

```ts
import { Schema, model, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "../schema-options";

const studentSchema = new Schema(
  { name: { type: String, required: true } },
  baseSchemaOptions,
);

export type StudentDoc = InferSchemaType<typeof studentSchema>;
export const StudentModel = model("Student", studentSchema);
```
