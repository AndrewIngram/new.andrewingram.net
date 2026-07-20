import { expect, test } from "vitest";

test("loads the Alchemy stack configuration", async () => {
  await expect(import("../alchemy.run.ts")).resolves.toBeDefined();
});
