import { describe, expect, it } from "vitest";
import { shouldFoldSessionCards } from "@/tmux-mobile/card-folding";

describe("shouldFoldSessionCards", () => {
  it("enables the accordion only on iPhone", () => {
    expect(shouldFoldSessionCards({ os: "ios" })).toBe(true);
    expect(shouldFoldSessionCards({ os: "ios", isPad: true })).toBe(false);
    expect(shouldFoldSessionCards({ os: "ios", isVision: true })).toBe(false);
  });

  it("keeps Vision compatibility mode and non-iOS platforms expanded", () => {
    expect(
      shouldFoldSessionCards({ os: "ios", visionDeviceDetected: true }),
    ).toBe(false);
    expect(shouldFoldSessionCards({ os: "android" })).toBe(false);
    expect(shouldFoldSessionCards({ os: "web" })).toBe(false);
  });
});
