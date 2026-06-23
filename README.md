# AndrewIngram.net

[![Deployed with Alchemy](https://alchemy.run/alchemy-badge.svg)](https://alchemy.run)

A TanStack Start app deployed to Cloudflare Workers with Alchemy.

## Features

- 🚀 Server-side rendering with TanStack Start
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization via Vite
- 🔄 Server functions and server route handlers
- 🔒 TypeScript by default
- 🌐 Cloudflare Workers runtime
- 📖 [TanStack Start docs](https://tanstack.com/start)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:3000`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

After deploying responsive image support, backfill dimensions for existing images and posts:

```bash
bun run images:backfill https://andrewingram.net
```

## Preview

Preview the production build locally:

```bash
npm run preview
```

## Destroy

Clean up all Cloudflare resources:

```bash
npm run destroy
```

## Project Structure

- `src/app/` - TanStack Start routes and app components
- `public/` - Static assets
- `alchemy.run.ts` - Infrastructure configuration
- `vite.config.ts` - TanStack Start and Vite configuration

## Learn More

- [TanStack Start Documentation](https://tanstack.com/start)
- [Alchemy Documentation](https://alchemy.run)

---

Built with TanStack Start and Alchemy.
