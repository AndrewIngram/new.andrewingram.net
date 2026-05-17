import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const providers = Layer.mergeAll(Cloudflare.providers());

const state = Cloudflare.state();

export const db: Effect.Effect<Cloudflare.D1Database, never, any> = Effect.gen(
  function* () {
    const alchemy = yield* Alchemy.AlchemyContext;
    const props = {
      migrationsDir: "./migrations",
      migrationsTable: "drizzle_migrations",
      importFiles: ["./initial-data/posts.sql"],
    };

    return yield* Cloudflare.D1Database(
      "database",
      alchemy.dev ? props : { ...props, name: "andrewingram" },
    );
  },
);

export const imageBucket: Effect.Effect<Cloudflare.R2Bucket, never, any> =
  Effect.gen(function* () {
    const alchemy = yield* Alchemy.AlchemyContext;
    return yield* Cloudflare.R2Bucket(
      "images",
      alchemy.dev ? {} : { name: "andrewingram-images" },
    );
  });

export const Website = Cloudflare.Vite("website", {
  compatibility: {
    date: "2026-04-30",
    flags: ["nodejs_compat"],
  },
  bindings: {
    DB: db,
    IMAGES: imageBucket,
  },
});

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;
export type WorkerEnv = WebsiteEnv;

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
