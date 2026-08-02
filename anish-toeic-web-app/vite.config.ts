import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

// Mirrors nginx/nginx.conf CSP (R2-FE / INJ-003). antd + Quill inject inline
// styles (style-src 'unsafe-inline'); bundled scripts are same-origin.
// R3-P1-MINIO: http://127.0.0.1:19000 = local MinIO presigned PUT endpoint.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:19000 https://*.amazonaws.com https://*.s3.*.amazonaws.com https://*.cloudinary.com; font-src 'self' data:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

// Dev-only: @vitejs/plugin-react-swc injects an inline react-refresh preamble,
// so script-src must relax to 'unsafe-inline' in dev. Preview + nginx keep the
// strict policy because production bundles external scripts.
const DEV_CSP = CSP.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // Ant Design
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design')) {
            return 'vendor-antd';
          }
          // Charts
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          // Animation/motion
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          // Remaining vendor libs (zustand, axios, react-query, zod, etc.)
          if (id.includes('node_modules') && !id.includes('vendor-')) {
            return 'vendor-misc';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    headers: {
      'Content-Security-Policy': DEV_CSP,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7000',
        changeOrigin: true
      }
    }
  },
  preview: {
    headers: {
      'Content-Security-Policy': CSP,
    },
  },
});
