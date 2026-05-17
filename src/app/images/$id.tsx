import { createFileRoute } from "@tanstack/react-router";

import { AppRuntime } from "@/lib/runtime";
import { getImageObjectById } from "@/lib/images";

export const Route = createFileRoute("/images/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { image, object } = await AppRuntime.runPromise(getImageObjectById(params.id));
          const headers = new Headers({
            "Content-Type": image.mimeType,
            "Content-Length": String(object.size),
            ETag: object.httpEtag,
            "Cache-Control": "public, max-age=31536000, immutable",
          });
          object.writeHttpMetadata(headers);

          return new Response(object.body, { headers });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
