import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

// Short commit shown next to the version in the footer, so you can tell which build is live.
// Cloudflare Builds provides it as WORKERS_CI_COMMIT_SHA; locally it comes from git.
function commit(): string {
  const sha = process.env.WORKERS_CI_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
  plugins: [
    react(),
    // Cloudflare AI only runs on Cloudflare (there's no local version), so `npm run dev` doesn't connect to it by
    // default: that would need a Cloudflare login and use the free daily allowance. Translation then reports that AI
    // isn't available locally. To try real AI translation locally, run `FYC_REMOTE_AI=true npm run dev`.
    cloudflare({ remoteBindings: process.env.FYC_REMOTE_AI === 'true' }),
  ],
});
