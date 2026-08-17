import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/v1/transactions", () => {
  it("returns 401 without a deploy key", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/transactions", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.test", botClassification: "ai-crawler", amount: "1", payer: "0x1" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 401 with an unknown deploy key before it even looks at the body", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/transactions", {
        method: "POST",
        headers: { authorization: "Bearer not-a-real-key" },
        body: "not even json",
      }),
    );
    expect(response.status).toBe(401);
  });
});
