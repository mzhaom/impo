import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(
  path.resolve(process.cwd(), "sources/app/(app)/index.tsx"),
  "utf8",
);

describe("terminal draft clear action", () => {
  it("puts the local clear action beside the existing inline terminal buttons", () => {
    expect(appSource).toContain("clearInline = false");
    expect(appSource).toContain("{clearButton}");
    expect(appSource).toContain('accessibilityLabel="Clear terminal input"');
    expect(appSource).toMatch(/terminalInputRef\.current = "";\s*}\}\s*clearInline/);
    expect(appSource).not.toContain("paneComposerBelowInputActions");
  });

  it("keeps clear local and available while a send request is pending", () => {
    const clearButton = appSource.match(
      /const clearButton =[\s\S]*?accessibilityLabel="Clear terminal input"[\s\S]*?<\/Pressable>/,
    )?.[0];
    expect(clearButton).toBeTruthy();
    expect(clearButton).not.toContain("sendBusy");
    expect(clearButton).not.toContain("onSend");
    expect(clearButton).not.toContain("api.");
  });

  it("collapses the phone terminal controls into one input shell", () => {
    expect(appSource).toContain("singleShell={windowWidth < 760}");
    expect(appSource).toContain("{usesSingleShell ? shortcutsBar : null}");
    expect(appSource).toMatch(/paneComposerInputShellSingle:\s*\{\s*minHeight: 108,/);
    expect(appSource).toContain("usesSingleShell && (standardStatus || error)");
    expect(appSource).toMatch(/paneComposerInlineButton:\s*\{\s*width: 44,\s*height: 44,/);
  });
});
