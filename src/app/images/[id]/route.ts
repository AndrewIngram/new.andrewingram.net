import { readFile } from "node:fs/promises";

import { AppRuntime } from "@/lib/runtime";
import { getImageById, getImageFilePath } from "@/lib/images";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/images/[id]">
) {
  try {
    const { id } = await params;
    const image = await AppRuntime.runPromise(getImageById(id));
    const data = await readFile(getImageFilePath(image.fileName));

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return new Response("Not found", { status: 404 });
  }
}
