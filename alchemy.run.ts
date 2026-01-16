import alchemy from "alchemy";
import { GitHubComment } from "alchemy/github";
import { CloudflareStateStore } from "alchemy/state";
import { D1Database, Nextjs } from "alchemy/cloudflare";

const app = await alchemy("andrewingram", {
  stateStore: (scope) => new CloudflareStateStore(scope),
});

const db = await D1Database("database", {
  name: "andrewingram",
  migrationsDir: "./migrations",
  migrationsTable: "drizzle_migrations",
});

console.log("Database Migrations Set Up");

export const worker = await Nextjs("website", {
  name: `${app.name}-${app.stage}-website`,
  bindings: {
    DB: db,
  },
});

if (process.env.PULL_REQUEST) {
  const previewUrl = worker.url;

  await GitHubComment("pr-preview-comment", {
    owner: process.env.GITHUB_REPOSITORY_OWNER || "your-username",
    repository: process.env.GITHUB_REPOSITORY_NAME || "andrewingram.net",
    issueNumber: Number(process.env.PULL_REQUEST),
    body: `
## 🚀 Preview Deployed

Your preview is ready!

**Preview URL:** ${previewUrl}

This preview was built from commit ${process.env.GITHUB_SHA}

---
<sub>🤖 This comment will be updated automatically when you push new commits to this PR.</sub>`,
  });
}

await app.finalize();
