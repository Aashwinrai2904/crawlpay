import path from "node:path";
import express from "express";

// Simulates a WordPress-ish origin site sitting behind the middleware.
// Serves static HTML only — no CMS, no business logic.

export function buildApp(): express.Express {
  const app = express();
  app.use(express.static(path.join(__dirname, "..", "public")));
  return app;
}
