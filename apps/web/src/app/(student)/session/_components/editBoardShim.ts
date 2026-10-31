// Owner: Person 2. TEMPORARY shim for POST /api/sessions/:id/board (plan F): replace with `editBoard` from
// @/lib/api once the data branch lands (same signature). Mock mode keeps the edit local only.
import { type BoardEditRequest, BoardEditResponse } from "@mento/contracts";
import { API_URL, ApiError, MOCK_API } from "@/lib/api";

export async function editBoard(sessionId: string, edit: BoardEditRequest, opts: { keepalive?: boolean } = {}): Promise<BoardEditResponse> {
  if (MOCK_API) return { ok: true, result: "applied" };
  const res = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}/board`, {
    method: "POST",
    keepalive: opts.keepalive,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edit),
  });
  if (!res.ok) throw new ApiError(res.status, `http_${res.status}`);
  return BoardEditResponse.parse(await res.json());
}
