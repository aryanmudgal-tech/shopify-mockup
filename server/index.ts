// The small Node server from spec section 9. It serves the page through Vite
// in middleware mode and answers /api/* itself, so the Anthropic key (stage 4)
// and every Shopify call stay on the server.

import http from "node:http";
import { createServer as createVite } from "vite";
import { handleApi } from "./api";

const PORT = Number(process.env.PORT ?? 5173);

const vite = await createVite({
  // A hot-reload port per server port, so recorded (5173) and live (5174) can run side by side.
  server: { middlewareMode: true, hmr: { port: 24678 + (PORT - 5173) } },
  appType: "spa",
});

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "server", message: "Something broke on the server." } }));
    });
    return;
  }
  vite.middlewares(req, res);
});

server.listen(PORT, () => {
  console.log(`Before You Buy on http://localhost:${PORT}`);
});
