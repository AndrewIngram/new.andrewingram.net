import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const providers = Layer.mergeAll(Cloudflare.providers());

const state = Cloudflare.state();

const db = Effect.gen(function* () {
  return yield* Cloudflare.D1Database("site-db", {
    migrationsDir: "./migrations",
    migrationsTable: "drizzle_migrations",
    importFiles: ["./initial-data/posts.sql"],
  });
});

export const imageBucket = Effect.gen(function* () {
  const alchemy = yield* Alchemy.AlchemyContext;
  return yield* Cloudflare.R2Bucket(
    "images",
    alchemy.dev ? {} : { name: "andrewingram-images" },
  );
});

export const imageTransformer = Cloudflare.Images({ name: "IMAGE_TRANSFORMER" });

export const Website = Cloudflare.Vite("website", {
  compatibility: {
    date: "2026-04-30",
    flags: ["nodejs_compat"],
  },
  env: {
    DB: db,
    IMAGES: imageBucket,
    IMAGE_TRANSFORMER: imageTransformer,
  },
});

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "andrewingram",
  {
    providers,
    state,
  },
  Effect.gen(function* () {
    const website = yield* Website;

    return {
      url: website.url,
    };
  }),
);
