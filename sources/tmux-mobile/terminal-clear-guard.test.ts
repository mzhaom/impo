import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(
  path.resolve(process.cwd(), "sources/app/(app)/index.tsx"),
  "utf8",
);

describe("terminal draft clear action", () => {
  it("puts an explicit local clear action below the terminal input", () => {
    expect(appSource).toContain("clearBelowInput = false");
    expect(appSource).toContain("showClear && clearBelowInput");
    expect(appSource).toContain('accessibilityLabel="Clear terminal input"');
    expect(appSource).toContain("<Text style={styles.paneComposerClearButtonText}>Clear input</Text>");
    expect(appSource).toMatch(/terminalInputRef\.current = "";\s*}\}\s*clearBelowInput/);
  });

  it("keeps clear local and available while a send request is pending", () => {
    const clearButton = appSource.match(
      /accessibilityLabel="Clear terminal input"[\s\S]*?<Text style=\{styles\.paneComposerClearButtonText\}>Clear input<\/Text>/,
    )?.[0];
    expect(clearButton).toBeTruthy();
    expect(clearButton).not.toContain("sendBusy");
    expect(clearButton).not.toContain("onSend");
    expect(clearButton).not.toContain("api.");
  });
});
