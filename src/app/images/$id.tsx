import { createFileRoute } from "@tanstack/react-router";

import { AppRuntime } from "@/lib/runtime";
import { getImageObjectById, transformImageObject } from "@/lib/images";
import {
  canTransformImage,
  imageRenditionCacheUrl,
  negotiateImageFormat,
  parseImageRendition,
} from "@/lib/image-delivery";

const originalResponse = (
  image: Awaited<ReturnType<typeof loadImage>>["image"],
  object: Awaited<ReturnType<typeof loadImage>>["object"],
  cacheControl = "public, max-age=31536000, immutable",
) => {
  const headers = new Headers({
    "Content-Type": image.mimeType,
    "Content-Length": String(object.size),
    ETag: object.httpEtag,
    "Cache-Control": cacheControl,
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
};

const loadImage = (id: string) => AppRuntime.runPromise(getImageObjectById(id));

export const Route = createFileRoute("/images/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const url = new URL(request.url);
          const hasTransformParams = url.search.length > 0;

          if (!hasTransformParams) {
            const { image, object } = await loadImage(params.id);
            return originalResponse(image, object);
          }

          const renditionParams = parseImageRendition(url.searchParams);
          if (renditionParams === null) {
            return new Response("Invalid image rendition", { status: 400 });
          }
          const { width } = renditionParams;

          const { image, object } = await loadImage(params.id);
          if (!canTransformImage(image.mimeType)) {
            return originalResponse(image, object);
          }

          const outputFormat = negotiateImageFormat(request.headers.get("Accept"), image.mimeType);
          try {
            const cacheUrl = imageRenditionCacheUrl(url, outputFormat);
            const cacheKey = new Request(cacheUrl, { method: "GET" });
            const cache = await caches.open("image-renditions");
            const cached = await cache.match(cacheKey);
            if (cached) return cached;

            const response = await AppRuntime.runPromise(
              transformImageObject(object, width, outputFormat),
            );
            if (!response.ok) throw new Error(`Image transformation returned ${response.status}`);
            const headers = new Headers(response.headers);
            headers.set("Cache-Control", "public, max-age=31536000, immutable");
            headers.set("Vary", "Accept");
            const rendition = new Response(response.body, {
              status: response.status,
              headers,
            });
            await cache.put(cacheKey, rendition.clone());
            return rendition;
          } catch (error) {
            console.error("[image.transform] failed", {
              id: params.id,
              width,
              outputFormat,
              error,
            });
            const fallback = await loadImage(params.id);
            return originalResponse(fallback.image, fallback.object, "public, max-age=60");
          }
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
