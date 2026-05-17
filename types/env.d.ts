import type { WorkerEnv } from "../alchemy.run.ts";

type AlchemyCloudflareEnv = WorkerEnv;

declare global {
  type CloudflareEnv = AlchemyCloudflareEnv;
}

declare module "cloudflare:workers" {
  namespace Cloudflare {
    export interface Env extends AlchemyCloudflareEnv {}
  }
}
