import { GetSubwayTrainsQueryParams, GetSubwayTrainsResponse } from "../../lib/api-zod/src/generated/api.ts";
import { createSubwayService, resolveUpstreamBase } from "../../artifacts/api-server/src/lib/seoulSubway.ts";

// Reuse the tested provider adapter. The key remains in the server environment.
const service = createSubwayService({
  getKey: () => process.env.SEOUL_SUBWAY_API_KEY?.trim() || undefined,
  fetchImpl: (url, init) => fetch(url, init),
  upstreamBase: resolveUpstreamBase(process.env.SEOUL_SUBWAY_API_BASE),
  log: { warn: (_details, message) => console.warn(message) },
});

export default {
  async fetch(request: Request) {
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "GET") {
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { ...headers, Allow: "GET" } });
    }
    const searchParams = new URL(request.url).searchParams;
    if (["line", "direction", "station"].some((key) => searchParams.getAll(key).length > 1)) {
      return Response.json({ error: "invalid_query" }, { status: 400, headers });
    }
    const params = Object.fromEntries(searchParams);
    const parsed = GetSubwayTrainsQueryParams.safeParse(params);
    if (!parsed.success) return Response.json({ error: "invalid_query" }, { status: 400, headers });
    try {
      const result = await service.getTrains(parsed.data);
      return Response.json(GetSubwayTrainsResponse.parse(result), { headers });
    } catch {
      console.error("subway response validation failed");
      return Response.json({ error: "upstream_unavailable" }, { status: 502, headers });
    }
  },
};
