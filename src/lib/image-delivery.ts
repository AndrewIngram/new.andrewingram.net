export const IMAGE_WIDTHS = [320, 480, 640, 960, 1280] as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
export type ImageFormat = "image/avif" | "image/webp" | "image/jpeg" | "image/png";
export type ImageRenditionCacheMode = "runtime" | "memory" | "runtime-memory" | "local-r2";
type ImageRenditionCacheStorage = Pick<CacheStorage, "open">;
type ImageRenditionCacheOperations = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};
type ImageRenditionCache = ImageRenditionCacheOperations & { mode: ImageRenditionCacheMode };
type OpenImageRenditionCacheOptions = {
  memoryFallback?: boolean;
};

export const parseImageWidth = (value: string | null): ImageWidth | null => {
  const width = Number(value);
  return IMAGE_WIDTHS.includes(width as ImageWidth) ? (width as ImageWidth) : null;
};

export const parseImageRendition = (searchParams: URLSearchParams) => {
  const parameters = [...searchParams.keys()];
  const width = parseImageWidth(searchParams.get("width"));
  if (
    width === null ||
    searchParams.get("format") !== "auto" ||
    searchParams.getAll("width").length !== 1 ||
    searchParams.getAll("format").length !== 1 ||
    parameters.some((name) => name !== "width" && name !== "format")
  ) {
    return null;
  }
  return { width };
};

export const negotiateImageFormat = (
  accept: string | null,
  sourceMimeType: string,
): ImageFormat => {
  const accepted = accept ?? "";
  if (accepted.includes("image/avif")) return "image/avif";
  if (accepted.includes("image/webp")) return "image/webp";
  return sourceMimeType === "image/png" ? "image/png" : "image/jpeg";
};

export const canTransformImage = (mimeType: string) =>
  mimeType !== "image/svg+xml" && mimeType !== "image/gif";

export const imageRenditionUrl = (src: string, width: ImageWidth) =>
  `${src}?width=${width}&format=auto`;

export const imageSrcSet = (src: string) =>
  IMAGE_WIDTHS.map((width) => `${imageRenditionUrl(src, width)} ${width}w`).join(", ");

export const POST_IMAGE_SIZES = "(max-width: 42rem) calc(100vw - 2rem), 40rem";

export const imageRenditionCacheUrl = (url: URL, format: ImageFormat) => {
  const cacheUrl = new URL(url);
  cacheUrl.searchParams.set("format", format.slice("image/".length));
  return cacheUrl;
};

export const imageRenditionObjectCacheKey = (
  id: string,
  etag: string,
  width: ImageWidth,
  format: ImageFormat,
) => `renditions/${id}/${encodeURIComponent(etag)}/${width}.${format.slice("image/".length)}`;

const defaultCacheStorage = () => (typeof caches === "undefined" ? undefined : caches);
const maxMemoryImageRenditionCacheEntries = 50;

const memoryImageRenditionCacheEntries = () => {
  const global = globalThis as typeof globalThis & {
    __imageRenditionCacheEntries?: Map<string, Response>;
  };
  global.__imageRenditionCacheEntries ??= new Map();
  return global.__imageRenditionCacheEntries;
};

const memoryImageRenditionCache: ImageRenditionCache = {
  mode: "memory",
  async match(request) {
    return memoryImageRenditionCacheEntries().get(request.url)?.clone();
  },
  async put(request, response) {
    const entries = memoryImageRenditionCacheEntries();
    if (!entries.has(request.url)) {
      const oldestKey = entries.keys().next().value;
      if (entries.size >= maxMemoryImageRenditionCacheEntries && oldestKey) {
        entries.delete(oldestKey);
      }
    }
    entries.set(request.url, response.clone());
  },
};

const runtimeImageRenditionCache = (
  cache: ImageRenditionCacheOperations,
  fallback?: ImageRenditionCache,
): ImageRenditionCache => ({
  mode: fallback ? "runtime-memory" : "runtime",
  async match(request) {
    try {
      return (await cache.match(request)) ?? fallback?.match(request);
    } catch {
      return fallback?.match(request);
    }
  },
  async put(request, response) {
    try {
      await cache.put(request, response.clone());
    } catch {}
    await fallback?.put(request, response);
  },
});

export const openImageRenditionCache = async (
  cacheStorage: ImageRenditionCacheStorage | undefined = defaultCacheStorage(),
  options: OpenImageRenditionCacheOptions = {},
): Promise<ImageRenditionCache | null> => {
  const fallback = options.memoryFallback ? memoryImageRenditionCache : undefined;
  if (!cacheStorage) return fallback ?? null;

  try {
    return runtimeImageRenditionCache(await cacheStorage.open("image-renditions"), fallback);
  } catch {
    return fallback ?? null;
  }
};

export const matchImageRenditionCache = async (
  cache: ImageRenditionCache | null,
  request: Request,
) => {
  if (!cache) return undefined;

  try {
    return await cache.match(request);
  } catch {
    return undefined;
  }
};

export const putImageRenditionCache = async (
  cache: ImageRenditionCache | null,
  request: Request,
  response: Response,
) => {
  if (!cache) return;

  try {
    await cache.put(request, response);
  } catch {}
};
