import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

describe("mock-origin static server", () => {
  it("serves the homepage", async () => {
    const app = express();
    app.use(express.static(path.join(__dirname, "..", "public")));

    const response = await request(app).get("/index.html");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Mock Origin");
  });
});
