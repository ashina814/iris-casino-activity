import { describe, expect, it } from "vitest";
import { annotateErrorStage, unexpectedErrorLogDetails } from "./errors.js";

describe("unexpectedErrorLogDetails", () => {
  it("records diagnostics without retaining secret-shaped values", () => {
    const error = new Error("roulette failed: Bearer secret-token access_token=another-secret", {
      cause: new Error("upstream api_key=third-secret")
    });
    const details = unexpectedErrorLogDetails(annotateErrorStage(error, "roulette.settle"));

    expect(details).toMatchObject({
      stage: "roulette.settle",
      errorName: "Error",
      causeMessage: "upstream api_key=[REDACTED]"
    });
    expect(JSON.stringify(details)).not.toContain("secret-token");
    expect(JSON.stringify(details)).not.toContain("another-secret");
    expect(JSON.stringify(details)).not.toContain("third-secret");
  });
});
