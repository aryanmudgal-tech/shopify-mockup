import { describe, expect, it } from "vitest";
import { formatUsd } from "./money";

describe("formatUsd", () => {
  it("drops cents on whole dollars", () => {
    expect(formatUsd(143300)).toBe("$1,433");
    expect(formatUsd(100)).toBe("$1");
    expect(formatUsd(0)).toBe("$0");
  });

  it("keeps cents otherwise", () => {
    expect(formatUsd(13640)).toBe("$136.40");
    expect(formatUsd(68199)).toBe("$681.99");
  });
});
