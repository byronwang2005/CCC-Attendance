import { createServer } from 'vite';
import { onRequestPost } from '../functions/api/generate.js';
// Exercise the real QR handler locally. No production services or stats writes.
const server = await createServer({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [
    {
      name: 'local-qr-api',
      configureServer(server) {
        server.middlewares.use('/api/generate', async (req, res) => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const response = await onRequestPost({
            request: new Request('http://localhost/api/generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: Buffer.concat(chunks)
            }),
            env: {},
            waitUntil: () => {}
          });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        });
      }
    }
  ]
});
await server.listen();
server.printUrls();
