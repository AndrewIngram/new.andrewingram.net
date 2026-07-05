import * as cf from "cloudflare:workers";
import { AsyncLocalStorage } from "node:async_hooks";
import type { WebsiteEnv } from "../alchemy.run.ts";

const requestEnv = new AsyncLocalStorage<WebsiteEnv>();

export const runWithEnv = <A>(env: WebsiteEnv, fn: () => A) => requestEnv.run(env, fn);

export const envSource = () => (requestEnv.getStore() ? "request-env" : "cloudflare-workers");

const getEnv = () => requestEnv.getStore() ?? (cf.env as unknown as WebsiteEnv);

export const env = new Proxy({} as WebsiteEnv, {
  get(_, prop) {
    return getEnv()[prop as keyof WebsiteEnv];
  },
});
