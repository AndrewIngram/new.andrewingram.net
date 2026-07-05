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

const debugAuth = Effect.gen(function* () {
  const getCloudflareEnv = yield* Cloudflare.CloudflareEnvironment;
  const cloudflareEnv = yield* getCloudflareEnv;

  return {
    type: cloudflareEnv.type,
    source: cloudflareEnv.source,
    expiresAt: cloudflareEnv.type === "oauth" ? cloudflareEnv.expires : undefined,
    startedAt: Date.now(),
  };
});

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

export const DebugWorker = Cloudflare.Worker("debug-worker", {
  main: "./src/debug-worker.ts",
  compatibility: {
    date: "2026-04-30",
    flags: ["nodejs_compat"],
  },
  env: {
    DB: db,
    IMAGES: imageBucket,
    IMAGE_TRANSFORMER: imageTransformer,
    DEBUG_AUTH: debugAuth,
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
    const debugWorker = yield* DebugWorker;

    return {
      url: website.url,
      debugUrl: debugWorker.url,
    };
  }),
);
