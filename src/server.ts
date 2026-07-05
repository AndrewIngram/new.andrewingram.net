import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

import type { WebsiteEnv } from "../alchemy.run.ts";
import { runWithEnv } from "./env";

const handler = createStartHandler(defaultStreamHandler);

export default {
  fetch(request: Request, env: WebsiteEnv) {
    return runWithEnv(env, () => handler(request));
  },
};
