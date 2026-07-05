import { describe, expect, it } from "vitest";
import {
  canTransformImage,
  imageRenditionCacheUrl,
  imageSrcSet,
  matchImageRenditionCache,
  negotiateImageFormat,
  openImageRenditionCache,
  parseImageRendition,
  parseImageWidth,
  putImageRenditionCache,
} from "./image-delivery";

describe("image delivery", () => {
  it("accepts only configured widths", () => {
    expect(parseImageWidth("640")).toBe(640);
    expect(parseImageWidth("641")).toBeNull();
    expect(parseImageWidth(null)).toBeNull();
  });

  it("rejects malformed rendition parameters", () => {
    expect(parseImageRendition(new URLSearchParams("width=640&format=auto"))).toEqual({
      width: 640,
    });
    expect(parseImageRendition(new URLSearchParams("width=641&format=auto"))).toBeNull();
    expect(parseImageRendition(new URLSearchParams("width=640&format=auto&width=320"))).toBeNull();
    expect(parseImageRendition(new URLSearchParams("width=640&format=auto&quality=1"))).toBeNull();
  });

  it("negotiates AVIF, WebP, then a source-compatible format", () => {
    expect(negotiateImageFormat("image/avif,image/webp", "image/png")).toBe("image/avif");
    expect(negotiateImageFormat("image/webp,*/*", "image/png")).toBe("image/webp");
    expect(negotiateImageFormat("image/jpeg", "image/png")).toBe("image/png");
    expect(negotiateImageFormat(null, "image/heic")).toBe("image/jpeg");
  });

  it("bypasses formats whose semantics should be preserved", () => {
    expect(canTransformImage("image/svg+xml")).toBe(false);
    expect(canTransformImage("image/gif")).toBe(false);
    expect(canTransformImage("image/jpeg")).toBe(true);
  });

  it("builds width-descriptor candidates", () => {
    expect(imageSrcSet("/images/1")).toContain("/images/1?width=1280&format=auto 1280w");
  });

  it("separates negotiated formats in the cache URL", () => {
    const requestUrl = new URL("https://example.com/images/1?width=640&format=auto");
    expect(imageRenditionCacheUrl(requestUrl, "image/avif").search).toBe("?width=640&format=avif");
    expect(imageRenditionCacheUrl(requestUrl, "image/webp").search).toBe("?width=640&format=webp");
  });

  it("treats an unavailable runtime cache as a miss", async () => {
    const cache = await openImageRenditionCache({
      open: async () => {
        throw new Error("No Cache was configured");
      },
    });

    expect(cache).toBeNull();
  });

  it("ignores cache read and write failures", async () => {
    const cache = {
      mode: "memory" as const,
      match: async () => {
        throw new Error("cache read failed");
      },
      put: async () => {
        throw new Error("cache write failed");
      },
    };
    const request = new Request("https://example.com/images/1?width=320&format=png");

    await expect(matchImageRenditionCache(cache, request)).resolves.toBeUndefined();
    await expect(putImageRenditionCache(cache, request, new Response("ok"))).resolves.toBeUndefined();
  });

  it("can fall back to a local memory cache", async () => {
    const cache = await openImageRenditionCache(
      {
        open: async () => {
          throw new Error("No Cache was configured");
        },
      },
      { memoryFallback: true },
    );
    const request = new Request("https://example.com/images/1?width=320&format=png&test=memory");

    expect(cache?.mode).toBe("memory");
    await putImageRenditionCache(cache, request, new Response("cached"));

    const cached = await matchImageRenditionCache(cache, request);
    await expect(cached?.text()).resolves.toBe("cached");
  });

  it("uses the local memory cache when runtime writes fail", async () => {
    let runtimeWriteAttempted = false;
    const runtimeCache = {
      match: async () => undefined,
      put: async () => {
        runtimeWriteAttempted = true;
        throw new Error("No Cache was configured");
      },
    } as unknown as Cache;
    const cache = await openImageRenditionCache(
      {
        open: async () => runtimeCache,
      },
      { memoryFallback: true },
    );
    const request = new Request("https://example.com/images/1?width=480&format=png&test=runtime");

    expect(cache?.mode).toBe("runtime-memory");
    await putImageRenditionCache(cache, request, new Response("cached"));

    const cached = await matchImageRenditionCache(cache, request);
    expect(runtimeWriteAttempted).toBe(true);
    await expect(cached?.text()).resolves.toBe("cached");
  });
});
