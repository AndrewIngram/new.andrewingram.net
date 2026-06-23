const baseUrl = process.argv[2];

if (!baseUrl) {
  throw new Error("Usage: bun run images:backfill <site-url>");
}

const response = await fetch(new URL("/cms/image-backfill", baseUrl), {
  method: "POST",
  headers: { "X-Image-Backfill": "confirm" },
});

if (!response.ok) {
  throw new Error(`Image backfill failed: ${response.status} ${await response.text()}`);
}

console.log(await response.json());
