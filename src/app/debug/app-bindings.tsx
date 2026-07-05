import { createFileRoute } from "@tanstack/react-router";

import { env, envSource } from "@/env";

const describeError = (error: unknown) =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      }
    : { value: String(error) };

const checkD1 = async () => {
  const startedAt = Date.now();

  try {
    const row = await env.DB.prepare("select count(*) as count from posts").first<{
      count: number;
    }>();

    return {
      ok: true,
      check: "d1",
      count: row?.count ?? null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      check: "d1",
      error: describeError(error),
      durationMs: Date.now() - startedAt,
    };
  }
};

const checkR2 = async () => {
  const startedAt = Date.now();

  try {
    const result = await env.IMAGES.list({ limit: 1 });

    return {
      ok: true,
      check: "r2",
      objectCount: result.objects.length,
      truncated: result.truncated,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      check: "r2",
      error: describeError(error),
      durationMs: Date.now() - startedAt,
    };
  }
};

export const Route = createFileRoute("/debug/app-bindings")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();
        const checks = await Promise.all([checkD1(), checkR2()]);
        const ok = checks.every((check) => check.ok);

        return Response.json(
          {
            ok,
            layer: "website-route-handler",
            envSource: envSource(),
            checks,
            durationMs: Date.now() - startedAt,
          },
          { status: ok ? 200 : 500 },
        );
      },
    },
  },
});
