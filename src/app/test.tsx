import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { posts } from "@/db/schema";

export const Route = createFileRoute("/test")({
  server: {
    handlers: {
      GET: async () => {
        const db = getDb();
        const result = await db.select().from(posts).limit(5);

        return Response.json({ result });
      },
    },
  },
});
