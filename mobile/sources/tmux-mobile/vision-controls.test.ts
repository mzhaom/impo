import { describe, expect, it } from "vitest";
import {
  EDITABLE_FIELD_IDS,
  normalizeSpokenControllerUrl,
  resolveFieldPresentation,
  resolvePaneComposerPresentation,
  resolveVisionControls,
  requiresVisionModeChoice,
} from "./vision-controls";

describe("resolveVisionControls", () => {
  it("uses the Apple runtime signal in auto mode", () => {
    expect(resolveVisionControls("auto", true)).toBe(true);
    expect(resolveVisionControls("auto", false)).toBe(false);
  });

  it("supports a persisted fallback without misclassifying iPad", () => {
    expect(resolveVisionControls("on", false)).toBe(true);
    expect(resolveVisionControls("auto", false)).toBe(false);
  });

  it("never lets a preference re-enable text fields on detected Vision hardware", () => {
    expect(resolveVisionControls("auto", true)).toBe(true);
    expect(resolveVisionControls("on", true)).toBe(true);
  });
});

describe("requiresVisionModeChoice", () => {
  it("asks before mounting inputs when an older binary cannot identify the device", () => {
    expect(requiresVisionModeChoice(null, null)).toBe(true);
  });

  it("does not ask after a choice or when the native result is known", () => {
    expect(requiresVisionModeChoice(null, "on")).toBe(false);
    expect(requiresVisionModeChoice(null, "auto")).toBe(false);
    expect(requiresVisionModeChoice(true, null)).toBe(false);
    expect(requiresVisionModeChoice(false, null)).toBe(false);
  });
});

describe("resolveFieldPresentation", () => {
  it.each(EDITABLE_FIELD_IDS)("%s never mounts editable text on Vision", (field) => {
    expect(resolveFieldPresentation(field, true)).not.toBe("editable-text");
  });

  it.each(EDITABLE_FIELD_IDS)("%s remains editable off Vision", (field) => {
    expect(resolveFieldPresentation(field, false)).toBe("editable-text");
  });

  it("keeps terminal output readonly on every platform", () => {
    expect(resolveFieldPresentation("terminal-output", true)).toBe("readonly");
    expect(resolveFieldPresentation("terminal-output", false)).toBe("readonly");
  });
});

describe("resolvePaneComposerPresentation", () => {
  it("uses voice-first controls without an input, snippets, or upload on Vision", () => {
    expect(
      resolvePaneComposerPresentation({
        visionControls: true,
        showShortcuts: true,
        showUpload: true,
      }),
    ).toEqual({
      mountTextInput: false,
      showShortcuts: false,
      showUpload: false,
      showVoice: true,
      showKeys: true,
      showSend: true,
      showQuickKeys: false,
      showMore: true,
    });
  });

  it("preserves the standard composer", () => {
    expect(
      resolvePaneComposerPresentation({
        visionControls: false,
        showShortcuts: true,
        showUpload: true,
      }),
    ).toMatchObject({
      mountTextInput: true,
      showShortcuts: true,
      showUpload: true,
      showQuickKeys: false,
      showMore: false,
    });
  });
});

describe("normalizeSpokenControllerUrl", () => {
  it("maps the default controller phrases", () => {
    expect(normalizeSpokenControllerUrl("eng dot impo dot ai")).toBe("https://eng.impo.ai");
    expect(normalizeSpokenControllerUrl("production")).toBe("https://eng.impo.ai");
  });

  it("normalizes a spoken custom host", () => {
    expect(normalizeSpokenControllerUrl("demo dot example dot com")).toBe(
      "https://demo.example.com",
    );
  });
});
