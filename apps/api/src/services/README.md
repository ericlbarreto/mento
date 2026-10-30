# services

Business logic that routes/controllers call. A service never touches `request`/`reply`; it takes plain arguments and returns plain data (validated with `@mento/contracts`). Register each service in `container.ts` so controllers reach it with `request.server.container`.

- `mongo.service.ts`: MongoDB connection lifecycle (`connect`, `disconnect`, `state`, `ping`).
- Add yours as `<name>.service.ts` (e.g. `student.service.ts` using `StudentModel` from `@mento/db`).
