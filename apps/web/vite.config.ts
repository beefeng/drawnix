/// <reference types='vitest' />
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const LLM_PROXY_PATH = '/__drawnix_llm_proxy';
const REQUEST_HOP_BY_HOP_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'transfer-encoding',
  'upgrade',
]);
const RESPONSE_HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
]);

const isLoopbackHost = (hostname: string) => {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.')
  );
};

const sendProxyError = (
  res: Parameters<Connect.NextHandleFunction>[1],
  status: number,
  message: string
) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: { message } }));
};

const createLlmProxyMiddleware = (): Connect.NextHandleFunction => {
  return (req, res, next) => {
    if (!req.url?.startsWith(LLM_PROXY_PATH)) {
      next();
      return;
    }

    void (async () => {
      try {
        const requestUrl = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
        const target = requestUrl.searchParams.get('url');
        if (!target) {
          sendProxyError(res, 400, 'Missing target url');
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(target);
        } catch {
          sendProxyError(res, 400, 'Invalid target url');
          return;
        }
        if (!isLoopbackHost(targetUrl.hostname)) {
          sendProxyError(res, 403, 'Only loopback model endpoints can use the local proxy');
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const headers = new Headers();
        Object.entries(req.headers).forEach(([key, value]) => {
          const normalizedKey = key.toLowerCase();
          if (
            value === undefined ||
            REQUEST_HOP_BY_HOP_HEADERS.has(normalizedKey) ||
            normalizedKey.startsWith('sec-fetch-') ||
            normalizedKey.startsWith('x-forwarded-')
          ) {
            return;
          }
          if (Array.isArray(value)) {
            value.forEach((item) => headers.append(key, item));
          } else {
            headers.set(key, value);
          }
        });

        const upstream = await fetch(targetUrl, {
          method: req.method || 'GET',
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          redirect: 'manual',
          signal: AbortSignal.timeout(30000),
        });
        res.statusCode = upstream.status;
        upstream.headers.forEach((value, key) => {
          if (!RESPONSE_HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            res.setHeader(key, value);
          }
        });
        res.setHeader('Cache-Control', 'no-store');
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendProxyError(res, 502, `Local model proxy failed: ${message}`);
      }
    })();
  };
};

const llmProxyPlugin: Plugin = {
  name: 'drawnix-llm-proxy',
  configureServer(server) {
    server.middlewares.use(createLlmProxyMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(createLlmProxyMiddleware());
  },
};

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',

  server: {
    port: 7200,
    host: 'localhost',
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [react(), nxViteTsPaths(), llmProxyPlugin],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8',
    },
  },
});
