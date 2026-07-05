import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { Effect } from "effect";

import { dbLive } from "@/db/db";
import { getPublishedPosts } from "@/lib/posts";

type Env = {
  DB: D1Database;
  IMAGES: R2Bucket;
  DEBUG_AUTH: {
    type: string;
    source: unknown;
    expiresAt?: number;
    startedAt: number;
  };
};

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    headers: {
      "cache-control": "no-store",
      ...init?.headers,
    },
    ...init,
  });

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const startedAt = Date.now();

    try {
      if (url.pathname === "/db") {
        const row = await env.DB.prepare("select count(*) as count from posts").first<{
          count: number;
        }>();
        return json({
          ok: true,
          layer: "standalone-worker",
          check: "db",
          count: row?.count ?? null,
          durationMs: Date.now() - startedAt,
        });
      }

      if (url.pathname === "/effect-db") {
        const posts = await Effect.runPromise(getPublishedPosts().pipe(Effect.provide(dbLive(env.DB))));
        return json({
          ok: true,
          layer: "standalone-worker",
          check: "effect-db",
          count: posts.length,
          durationMs: Date.now() - startedAt,
        });
      }

      if (url.pathname === "/r2") {
        const result = await env.IMAGES.list({ limit: 1 });
        return json({
          ok: true,
          layer: "standalone-worker",
          check: "r2",
          objectCount: result.objects.length,
          truncated: result.truncated,
          durationMs: Date.now() - startedAt,
        });
      }

      if (url.pathname === "/auth") {
        return json({
          ok: true,
          layer: "standalone-worker",
          check: "auth",
          auth: env.DEBUG_AUTH,
          now: Date.now(),
          durationMs: Date.now() - startedAt,
        });
      }

      return json({
        ok: true,
        layer: "standalone-worker",
        checks: ["/auth", "/db", "/effect-db", "/r2"],
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      return json(
        {
          ok: false,
          layer: "standalone-worker",
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
        { status: 500 },
      );
    }
  },
};
