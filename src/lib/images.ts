import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "@/env";
import type { ImageFormat, ImageWidth } from "./image-delivery";

const ImageSchema = Schema.Struct({
  id: Schema.String,
  fileName: Schema.String,
  originalName: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  caption: Schema.optional(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type ImageAsset = Schema.Schema.Type<typeof ImageSchema>;

export class ImagesParseError extends Data.TaggedError("ImagesParseError")<{
  cause: unknown;
}> {}

export class ImagesDecodeError extends Data.TaggedError("ImagesDecodeError")<{
  label: string;
  cause: unknown;
}> {}

export class ImagesLoadAllError extends Data.TaggedError("ImagesLoadAllError")<{
  cause: unknown;
}> {}

export class ImagesLoadError extends Data.TaggedError("ImagesLoadError")<{
  id: string;
  cause: unknown;
}> {}

export class ImagesSaveError extends Data.TaggedError("ImagesSaveError")<{
  id: string;
  cause: unknown;
}> {}

export class ImagesMetadataError extends Data.TaggedError("ImagesMetadataError")<{
  id: string;
  missing: ReadonlyArray<string>;
}> {}

export class ImagesUploadError extends Data.TaggedError("ImagesUploadError")<{
  cause: unknown;
}> {}

export class ImagesDeleteError extends Data.TaggedError("ImagesDeleteError")<{
  id: string;
  cause: unknown;
}> {}

export class ImagesBackfillError extends Data.TaggedError("ImagesBackfillError")<{
  cause: unknown;
}> {}

const metadataKey = (id: string) => `metadata/${id}.json`;
const fileKey = (fileName: string) => `files/${fileName}`;

const parseJson = (input: string): Effect.Effect<unknown, ImagesParseError> =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: (cause) => new ImagesParseError({ cause }),
  });

const decodeImage = (raw: unknown, label: string): Effect.Effect<ImageAsset, ImagesDecodeError> =>
  Schema.decodeUnknownEffect(ImageSchema)(raw).pipe(
    Effect.mapError((cause) => new ImagesDecodeError({ label, cause })),
  );

const readImageMetadata = (id: string, label = id) =>
  Effect.gen(function* () {
    const object = yield* Effect.tryPromise(() => env.IMAGES.get(metadataKey(id)));
    if (!object) {
      return yield* Effect.fail(new ImagesLoadError({ id, cause: "Not found" }));
    }
    const raw = yield* Effect.tryPromise(() => object.text());
    const json = yield* parseJson(raw);
    return yield* decodeImage(json, label);
  });

export const getAllImages = () =>
  Effect.gen(function* () {
    const keys = yield* Effect.tryPromise(async () => {
      const keys: string[] = [];
      let cursor: string | undefined;

      do {
        const result = await env.IMAGES.list({
          prefix: "metadata/",
          ...(cursor ? { cursor } : {}),
        });
        keys.push(...result.objects.map((object) => object.key));
        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);

      return keys;
    });

    const images = yield* Effect.forEach(
      keys,
      (key) => {
        const id = path.basename(key, ".json");
        return readImageMetadata(id, key);
      },
      { concurrency: "unbounded" },
    );

    return images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }).pipe(Effect.mapError((cause) => new ImagesLoadAllError({ cause })));

export const getImageById = (id: string) =>
  readImageMetadata(id).pipe(
    Effect.mapError((cause) =>
      cause instanceof ImagesLoadError ? cause : new ImagesLoadError({ id, cause }),
    ),
  );

export const getImageObjectById = (id: string) =>
  Effect.gen(function* () {
    const image = yield* getImageById(id);
    const object = yield* Effect.tryPromise(() => env.IMAGES.get(fileKey(image.fileName)));
    if (!object) {
      return yield* Effect.fail(new ImagesLoadError({ id, cause: "File not found" }));
    }
    return { image, object };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ImagesLoadError ? cause : new ImagesLoadError({ id, cause }),
    ),
  );

export const transformImageObject = (
  object: R2ObjectBody,
  width: ImageWidth,
  format: ImageFormat,
) =>
  Effect.tryPromise(() =>
    env.IMAGE_TRANSFORMER.input(object.body)
      .transform({ width, fit: "scale-down" })
      .output({ format })
      .then((result) => result.response()),
  );

export type SaveImageInput = {
  id: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  caption?: string;
};

export const saveImage = (input: SaveImageInput) => {
  const resolvedId = input.id === "new" ? randomUUID() : input.id;

  return Effect.gen(function* () {
    const now = new Date().toISOString();

    const existing = yield* readImageMetadata(resolvedId).pipe(
      Effect.catchTag("ImagesLoadError", (cause) =>
        cause.cause === "Not found"
          ? Effect.succeed(null)
          : Effect.fail(new ImagesSaveError({ id: resolvedId, cause })),
      ),
    );

    const fileName = input.fileName ?? existing?.fileName;
    const originalName = input.originalName ?? existing?.originalName;
    const mimeType = input.mimeType ?? existing?.mimeType;
    const size = input.size ?? existing?.size;
    const width = input.width ?? existing?.width;
    const height = input.height ?? existing?.height;

    if (fileName == null || originalName == null || mimeType == null || size == null) {
      const missing = [
        fileName == null ? "fileName" : null,
        originalName == null ? "originalName" : null,
        mimeType == null ? "mimeType" : null,
        size == null ? "size" : null,
      ].filter((value): value is string => value !== null);

      return yield* Effect.fail(new ImagesMetadataError({ id: resolvedId, missing }));
    }

    const image: ImageAsset = {
      id: resolvedId,
      fileName,
      originalName,
      mimeType,
      size,
      ...(width == null ? {} : { width }),
      ...(height == null ? {} : { height }),
      caption: input.caption?.trim() || existing?.caption,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    yield* Effect.tryPromise(() =>
      env.IMAGES.put(metadataKey(resolvedId), JSON.stringify(image, null, 2), {
        httpMetadata: { contentType: "application/json" },
      }),
    );
    return image;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ImagesSaveError ? cause : new ImagesSaveError({ id: resolvedId, cause }),
    ),
  );
};

export type ImageUploadInput = {
  originalName: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
  caption?: string;
};

export const saveImageUpload = (input: ImageUploadInput) =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    const id = randomUUID();
    const safeName = path.basename(input.originalName);
    const ext = path.extname(safeName);
    const fileName = `${id}${ext}`;

    const dimensions = yield* Effect.tryPromise(() =>
      env.IMAGE_TRANSFORMER.info(new Blob([input.data.slice().buffer as ArrayBuffer]).stream()),
    );

    yield* Effect.tryPromise(() =>
      env.IMAGES.put(fileKey(fileName), input.data, {
        httpMetadata: { contentType: input.mimeType },
      }),
    );

    const image: ImageAsset = {
      id,
      fileName,
      originalName: safeName,
      mimeType: input.mimeType,
      size: input.size,
      ...("width" in dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
      caption: input.caption?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    yield* Effect.tryPromise(() =>
      env.IMAGES.put(metadataKey(id), JSON.stringify(image, null, 2), {
        httpMetadata: { contentType: "application/json" },
      }),
    );

    return image;
  }).pipe(Effect.mapError((cause) => new ImagesUploadError({ cause })));

export const deleteImage = (id: string) =>
  Effect.gen(function* () {
    const existing = yield* getImageById(id);
    yield* Effect.tryPromise(() =>
      env.IMAGES.delete([fileKey(existing.fileName), metadataKey(id)]),
    );
  }).pipe(Effect.catch((cause) => Effect.fail(new ImagesDeleteError({ id, cause }))));

export const backfillImageDimensions = () =>
  Effect.gen(function* () {
    const images = yield* getAllImages();
    let updated = 0;
    let skipped = 0;

    const resolved = yield* Effect.forEach(
      images,
      (image) =>
        Effect.gen(function* () {
          if (image.width != null && image.height != null) return image;

          const { object } = yield* getImageObjectById(image.id);
          const info = yield* Effect.tryPromise(() => env.IMAGE_TRANSFORMER.info(object.body));
          if (!("width" in info)) {
            skipped += 1;
            return image;
          }

          const saved = yield* saveImage({
            id: image.id,
            width: info.width,
            height: info.height,
          });
          updated += 1;
          return saved;
        }),
      { concurrency: 4 },
    );

    return { images: resolved, updated, skipped };
  }).pipe(Effect.mapError((cause) => new ImagesBackfillError({ cause })));
