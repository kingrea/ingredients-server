import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { eventHandler, setResponseHeader } from "h3";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function mountStaticFiles(app: ReturnType<typeof import("h3").createApp>, publicDir: string) {
  app.get(
    "/",
    eventHandler(() => {
      const indexPath = join(publicDir, "index.html");
      if (!existsSync(indexPath)) {
        return "Ingredient DB API is running. No frontend build found.";
      }
      return readFileSync(indexPath, "utf-8");
    })
  );

  app.get(
    "/assets/**",
    eventHandler((event) => {
      const urlPath = new URL(event.path, "http://localhost").pathname;
      const filePath = join(publicDir, urlPath);

      if (!existsSync(filePath)) {
        return null;
      }

      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] ?? "application/octet-stream";
      setResponseHeader(event, "content-type", mime);
      return readFileSync(filePath);
    })
  );
}
