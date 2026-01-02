import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileSystem } from "@effect/platform";

const ImageSchema = Schema.Struct({
  id: Schema.String,
  fileName: Schema.String,
  originalName: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
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

export class ImagesMetadataError extends Data.TaggedError(
  "ImagesMetadataError",
)<{
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

const DATA_ROOT = process.env.POSTS_DATA_DIR ?? process.cwd();
const DATA_DIR = path.join(DATA_ROOT, "data", "images");
const FILES_DIR = path.join(process.cwd(), "src", "public", "uploads");

const ensureDataDir = Effect.gen(function* (_) {
  const fs = yield* FileSystem.FileSystem;
  yield* _(fs.makeDirectory(DATA_DIR, { recursive: true }));
});

const ensureFilesDir = Effect.gen(function* (_) {
  const fs = yield* FileSystem.FileSystem;
  yield* _(fs.makeDirectory(FILES_DIR, { recursive: true }));
});

const parseJson = (input: string): Effect.Effect<unknown, ImagesParseError> =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: (cause) => new ImagesParseError({ cause }),
  });

const decodeImage = (
  raw: unknown,
  label: string,
): Effect.Effect<ImageAsset, ImagesDecodeError> =>
  Schema.decodeUnknown(ImageSchema)(raw).pipe(
    Effect.mapError((cause) => new ImagesDecodeError({ label, cause })),
  );

const readImageFile = (filePath: string, label: string) =>
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(filePath);
    const json = yield* _(parseJson(raw));
    return yield* _(decodeImage(json, label));
  });

const isNoEntryError = (
  error: unknown,
): error is {
  readonly _tag: "SystemError";
  readonly reason: "NotFound";
} =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  "reason" in error &&
  (error as { _tag?: string })._tag === "SystemError" &&
  (error as { reason?: string }).reason === "NotFound";

export const getImageFilePath = (fileName: string) =>
  path.join(FILES_DIR, fileName);

export const getAllImages = () =>
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    yield* _(ensureDataDir);
    const entries = yield* fs.readDirectory(DATA_DIR);
    const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
    const images = yield* _(
      Effect.forEach(
        jsonFiles,
        (entry) => readImageFile(path.join(DATA_DIR, entry), entry),
        { concurrency: "unbounded" },
      ),
    );
    return images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }).pipe(
    Effect.catchTag("SystemError", (cause) =>
      Effect.fail(new ImagesLoadAllError({ cause })),
    ),
  );

export const getImageById = (id: string) =>
  Effect.gen(function* (_) {
    yield* _(ensureDataDir);
    return yield* _(readImageFile(path.join(DATA_DIR, `${id}.json`), id));
  }).pipe(
    Effect.catchTag("SystemError", (cause) =>
      Effect.fail(new ImagesLoadError({ id, cause })),
    ),
  );

export type SaveImageInput = {
  id: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  caption?: string;
};

export const saveImage = (input: SaveImageInput) => {
  const resolvedId = input.id === "new" ? randomUUID() : input.id;

  return Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    yield* _(ensureDataDir);
    const now = new Date().toISOString();
    const filePath = path.join(DATA_DIR, `${resolvedId}.json`);

    const existing = yield* _(
      readImageFile(filePath, filePath).pipe(
        Effect.catchTag("SystemError", (cause) =>
          isNoEntryError(cause)
            ? Effect.succeed(null)
            : Effect.fail(new ImagesSaveError({ id: resolvedId, cause })),
        ),
      ),
    );

    const fileName = input.fileName ?? existing?.fileName;
    const originalName = input.originalName ?? existing?.originalName;
    const mimeType = input.mimeType ?? existing?.mimeType;
    const size = input.size ?? existing?.size;

    if (
      fileName == null ||
      originalName == null ||
      mimeType == null ||
      size == null
    ) {
      const missing = [
        fileName == null ? "fileName" : null,
        originalName == null ? "originalName" : null,
        mimeType == null ? "mimeType" : null,
        size == null ? "size" : null,
      ].filter((value): value is string => value !== null);

      return yield* _(
        Effect.fail(new ImagesMetadataError({ id: resolvedId, missing })),
      );
    }

    const image: ImageAsset = {
      id: resolvedId,
      fileName,
      originalName,
      mimeType,
      size,
      caption: input.caption?.trim() || existing?.caption,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    yield* _(fs.writeFileString(filePath, JSON.stringify(image, null, 2)));
    return image;
  }).pipe(
    Effect.catchTag("SystemError", (cause) =>
      Effect.fail(new ImagesSaveError({ id: resolvedId, cause })),
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
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    yield* _(ensureDataDir);
    yield* _(ensureFilesDir);
    const now = new Date().toISOString();
    const id = randomUUID();
    const safeName = path.basename(input.originalName);
    const ext = path.extname(safeName);
    const fileName = `${id}${ext}`;
    const filePath = path.join(FILES_DIR, fileName);

    yield* _(fs.writeFile(filePath, input.data));

    const image: ImageAsset = {
      id,
      fileName,
      originalName: safeName,
      mimeType: input.mimeType,
      size: input.size,
      caption: input.caption?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    yield* _(
      fs.writeFileString(
        path.join(DATA_DIR, `${id}.json`),
        JSON.stringify(image, null, 2),
      ),
    );

    return image;
  }).pipe(
    Effect.catchTag("SystemError", (cause) =>
      Effect.fail(new ImagesUploadError({ cause })),
    ),
  );

export const deleteImage = (id: string) =>
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    const existing = yield* _(getImageById(id));
    const metaPath = path.join(DATA_DIR, `${id}.json`);
    const filePath = getImageFilePath(existing.fileName);

    yield* _(
      fs.remove(filePath).pipe(
        Effect.catchTag("SystemError", (cause) =>
          isNoEntryError(cause) ? Effect.succeed(undefined) : Effect.fail(cause),
        ),
      ),
    );

    yield* _(fs.remove(metaPath));
  }).pipe(
    Effect.catchAll((cause) =>
      Effect.fail(new ImagesDeleteError({ id, cause })),
    ),
  );
