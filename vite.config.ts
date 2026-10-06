import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    // Cloudflare AI only runs on Cloudflare (there's no local version), so `npm run dev` doesn't connect to it by
    // default: that would need a Cloudflare login and use the free daily allowance. Translation then reports that AI
    // isn't available locally. To try real AI translation locally, run `FYC_REMOTE_AI=true npm run dev`.
    cloudflare({ remoteBindings: process.env.FYC_REMOTE_AI === 'true' }),
  ],
});
