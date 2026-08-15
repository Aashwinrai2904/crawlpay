import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("mock-origin static server", () => {
  it("serves the homepage", async () => {
    const response = await request(buildApp()).get("/index.html");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Mock Origin");
  });
});
