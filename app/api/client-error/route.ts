const MAX_BODY_BYTES = 4_096;
const VALID_BOUNDARIES = new Set(["route", "global"]);

function clean(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").replace(/[?#].*$/, "").slice(0, limit)
    : "";
}

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return new Response(null, { status: 403 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const boundary = clean(body.boundary, 16);
    if (!VALID_BOUNDARIES.has(boundary)) return new Response(null, { status: 400 });
    const record = {
      event: "tri_relay_client_error",
      release: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 12),
      boundary,
      name: clean(body.name, 80) || "Error",
      digest_present: body.digest_present === true,
      path: clean(body.path, 160) || "/",
    };
    console.error(JSON.stringify(record));
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
