import { createFileRoute } from "@tanstack/react-router";

import { env } from "@/env";
import { AppRuntime } from "@/lib/runtime";
import { getImageObjectById, transformImageObject } from "@/lib/images";
import {
  canTransformImage,
  imageRenditionCacheUrl,
  imageRenditionObjectCacheKey,
  type ImageRenditionCacheMode,
  matchImageRenditionCache,
  negotiateImageFormat,
  openImageRenditionCache,
  parseImageRendition,
  putImageRenditionCache,
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

const withImageRenditionCacheHeaders = (
  response: Response,
  status: "hit" | "miss",
  mode: ImageRenditionCacheMode | "none",
) => {
  const headers = new Headers(response.headers);
  headers.set("X-Image-Rendition-Cache", status);
  headers.set("X-Image-Rendition-Cache-Mode", mode);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const devRenditionCacheResponse = async (key: string) => {
  if (!import.meta.env.DEV) return null;

  try {
    const object = await env.IMAGES.get(key);
    if (!object) return null;

    const headers = new Headers({
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept",
    });
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  } catch {
    return null;
  }
};

const putDevRenditionCache = async (key: string, response: Response) => {
  if (!import.meta.env.DEV) return;

  try {
    const contentType = response.headers.get("Content-Type");
    const options = contentType ? { httpMetadata: { contentType } } : undefined;
    await env.IMAGES.put(key, await response.arrayBuffer(), options);
  } catch {}
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
          const cacheUrl = imageRenditionCacheUrl(url, outputFormat);
          const cacheKey = new Request(cacheUrl, { method: "GET" });
          const cache = await openImageRenditionCache(undefined, {
            memoryFallback: import.meta.env.DEV,
          });
          const cached = await matchImageRenditionCache(cache, cacheKey);
          if (cached) {
            return withImageRenditionCacheHeaders(cached, "hit", cache?.mode ?? "none");
          }
          const devCacheKey = imageRenditionObjectCacheKey(
            params.id,
            object.etag,
            width,
            outputFormat,
          );
          const devCached = await devRenditionCacheResponse(devCacheKey);
          if (devCached) {
            return withImageRenditionCacheHeaders(devCached, "hit", "local-r2");
          }

          try {
            const response = await AppRuntime.runPromise(
              transformImageObject(object, width, outputFormat),
            );
            if (!response.ok) throw new Error(`Image transformation returned ${response.status}`);
            const headers = new Headers(response.headers);
            headers.set("Cache-Control", "public, max-age=31536000, immutable");
            headers.set("Vary", "Accept");
            headers.set("X-Image-Rendition-Cache", "miss");
            headers.set("X-Image-Rendition-Cache-Mode", cache?.mode ?? "none");
            const rendition = new Response(response.body, {
              status: response.status,
              headers,
            });
            await putImageRenditionCache(cache, cacheKey, rendition.clone());
            await putDevRenditionCache(devCacheKey, rendition.clone());
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
