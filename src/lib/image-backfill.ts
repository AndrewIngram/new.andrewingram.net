import { Effect } from "effect";
import { backfillImageDimensions } from "./images";
import { backfillPostImageDimensions } from "./posts";

export const backfillImages = () =>
  Effect.gen(function* () {
    const imageResult = yield* backfillImageDimensions();
    const dimensions = new Map(
      imageResult.images.flatMap((image) =>
        image.width == null || image.height == null
          ? []
          : [[image.id, { width: image.width, height: image.height }] as const],
      ),
    );
    const postResult = yield* backfillPostImageDimensions(dimensions);

    return {
      imagesUpdated: imageResult.updated,
      imagesSkipped: imageResult.skipped,
      postsUpdated: postResult.updated,
    };
  });
