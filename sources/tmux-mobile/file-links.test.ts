import { describe, expect, it } from "vitest";
import { filePathFromLocalHref, resolveLinkedFilePath, splitFilePathText } from "./file-links";

describe("file link parsing", () => {
  it("keeps uploaded absolute temp paths absolute", () => {
    const path = "/var/folders/xc/25jxs2fj27z1xy_4y5krmt6w0000gn/T/tmux-mobile-uploads/IMG_4509.png";

    expect(filePathFromLocalHref(path)).toBe(path);
    expect(splitFilePathText(`see ${path}`)).toContainEqual({
      kind: "file",
      text: path,
      path,
    });
  });

  it("repairs temp paths damaged by relative/default image handlers", () => {
    const repaired =
      "/var/folders/xc/25jxs2fj27z1xy_4y5krmt6w0000gn/T/tmux-mobile-uploads/IMG_4509.png";

    expect(resolveLinkedFilePath("../var/folders/xc/25jxs2fj27z1xy_4y5krmt6w0000gn/T/tmux-mobile-uploads/IMG_4509.png")).toBe(repaired);
    expect(filePathFromLocalHref("https://../var/folders/xc/25jxs2fj27z1xy_4y5krmt6w0000gn/T/tmux-mobile-uploads/IMG_4509.png")).toBe(repaired);
  });

  it("resolves markdown-relative assets against the current file", () => {
    expect(filePathFromLocalHref("images/chart.png", "/Users/homo/src/report/readme.md")).toBe(
      "/Users/homo/src/report/images/chart.png",
    );
    expect(filePathFromLocalHref("../chart.png", "/Users/homo/src/report/readme.md")).toBe(
      "/Users/homo/src/chart.png",
    );
  });
});
