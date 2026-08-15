import path from "node:path";
import express from "express";

// Simulates a WordPress-ish origin site sitting behind the middleware.
// Serves static HTML only — no CMS, no business logic.

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`mock-origin listening on :${PORT}`);
});
