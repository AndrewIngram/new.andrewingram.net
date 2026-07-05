import { createFileRoute } from "@tanstack/react-router";

import { env, envSource } from "@/env";
import { getPublishedPosts } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

const describeError = (error: unknown) =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      }
    : { value: String(error) };

export const Route = createFileRoute("/debug/app-runtime")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();

        try {
          const rawRow = await env.DB.prepare("select count(*) as count from posts").first<{
            count: number;
          }>();
          const posts = await AppRuntime.runPromise(getPublishedPosts());

          return Response.json({
            ok: true,
            layer: "website-route-handler",
            envSource: envSource(),
            rawCount: rawRow?.count ?? null,
            publishedCount: posts.length,
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          return Response.json(
            {
              ok: false,
              layer: "website-route-handler",
              envSource: envSource(),
              error: describeError(error),
              durationMs: Date.now() - startedAt,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
