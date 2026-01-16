import { getDb } from "@/db";
import { posts } from "@/db/schema";

export async function GET() {
  const db = getDb();

  const result = await db.select().from(posts).limit(1);

  console.log(result);

  return new Response("foo");
}
