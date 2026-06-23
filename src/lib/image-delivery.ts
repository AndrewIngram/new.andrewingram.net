export const IMAGE_WIDTHS = [320, 480, 640, 960, 1280] as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
export type ImageFormat = "image/avif" | "image/webp" | "image/jpeg" | "image/png";

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
