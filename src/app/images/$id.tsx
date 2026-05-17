import { createFileRoute } from "@tanstack/react-router";

import { AppRuntime } from "@/lib/runtime";
import { getImageBodyById } from "@/lib/images";

export const Route = createFileRoute("/images/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { image, data } = await AppRuntime.runPromise(getImageBodyById(params.id));

          return new Response(data, {
            headers: {
              "Content-Type": image.mimeType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
