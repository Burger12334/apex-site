import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

// The activity log gets a card whenever a page fails with a server error, so outages are never silent.
// The same error on the same page is reported at most once a minute.
const lastReported = new Map<string, number>();
async function reportCrash(request: Request, error: unknown) {
  try {
    const path = new URL(request.url).pathname;
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    const key = `${path}|${message.slice(0, 80)}`;
    if (Date.now() - (lastReported.get(key) ?? 0) < 60000) return;
    lastReported.set(key, Date.now());
    const { logEvent, LOG_COLORS } = await import("./lib/audit-log.server");
    await logEvent({ title: "Site error", color: LOG_COLORS.bad, lines: [`**Page** ${path}`, `**Error** ${message.slice(0, 500)}`, error instanceof Error && error.stack ? `\`\`\`${error.stack.split("\n").slice(1, 4).join("\n").slice(0, 600)}\`\`\`` : ""] });
  } catch { /* logging must never make an error worse */ }
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response, request: Request): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const captured = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(captured);
  await reportCrash(request, captured);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      console.error(error);
      await reportCrash(request, error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
