import { createFileRoute } from "@tanstack/react-router";
import { backfillImages } from "@/lib/image-backfill";
import { AppRuntime } from "@/lib/runtime";

export const Route = createFileRoute("/cms/image-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("X-Image-Backfill") !== "confirm") {
          return new Response("Not found", { status: 404 });
        }

        try {
          const result = await AppRuntime.runPromise(backfillImages());
          return Response.json(result);
        } catch (error) {
          console.error("[image.backfill] failed", { error });
          return new Response("Backfill failed", { status: 500 });
        }
      },
    },
  },
});
