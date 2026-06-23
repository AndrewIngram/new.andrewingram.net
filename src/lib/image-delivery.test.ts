import { describe, expect, it } from "vitest";
import {
  canTransformImage,
  imageRenditionCacheUrl,
  imageSrcSet,
  negotiateImageFormat,
  parseImageRendition,
  parseImageWidth,
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
});
