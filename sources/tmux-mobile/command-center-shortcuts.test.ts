import { describe, expect, it } from "vitest";
import {
  resolveCommandCenterShortcut,
  type CommandCenterShortcutEvent,
} from "./command-center-shortcuts";

describe("resolveCommandCenterShortcut", () => {
  it.each([
    ["ArrowLeft", "left"],
    ["h", "left"],
    ["H", "left"],
    ["ArrowRight", "right"],
    ["l", "right"],
    ["L", "right"],
    ["ArrowUp", "up"],
    ["k", "up"],
    ["K", "up"],
    ["ArrowDown", "down"],
    ["j", "down"],
    ["J", "down"],
  ] as const)("maps %s to move %s", (key, direction) => {
    expect(resolveCommandCenterShortcut({ key })).toEqual({
      type: "move",
      direction,
    });
  });

  it.each([
    ["Enter", { type: "view" }],
    ["o", { type: "view" }],
    ["O", { type: "view" }],
    ["r", { type: "reply" }],
    ["R", { type: "reply" }],
    ["f", { type: "response" }],
    ["F", { type: "response" }],
    ["t", { type: "transcript" }],
    ["T", { type: "transcript" }],
    ["u", { type: "refresh" }],
    ["U", { type: "refresh" }],
    ["Escape", { type: "escape" }],
  ] as const)("maps %s to the expected command-center action", (key, action) => {
    expect(resolveCommandCenterShortcut({ key })).toEqual(action);
  });

  it("keeps shift-only shortcuts available", () => {
    expect(
      resolveCommandCenterShortcut({ key: "R", shiftKey: true }),
    ).toEqual({ type: "reply" });
    expect(
      resolveCommandCenterShortcut({ key: "ArrowLeft", shiftKey: true }),
    ).toEqual({ type: "move", direction: "left" });
  });

  it.each([
    ["control", { key: "r", ctrlKey: true }],
    ["command", { key: "r", metaKey: true }],
    ["option", { key: "r", altKey: true }],
    [
      "combined",
      { key: "r", ctrlKey: true, metaKey: true, altKey: true, shiftKey: true },
    ],
  ] satisfies ReadonlyArray<readonly [string, CommandCenterShortcutEvent]>)(
    "does not claim %s-modified keys",
    (_label, event) => {
      expect(resolveCommandCenterShortcut(event)).toBeNull();
    },
  );

  it.each(["Enter", "o", "r", "f", "t"])(
    "ignores repeated modal-opening %s shortcuts",
    (key) => {
      expect(resolveCommandCenterShortcut({ key, repeat: true })).toBeNull();
    },
  );

  it("allows key repeat for card navigation", () => {
    expect(
      resolveCommandCenterShortcut({ key: "j", repeat: true }),
    ).toEqual({ type: "move", direction: "down" });
    expect(
      resolveCommandCenterShortcut({ key: "ArrowRight", repeat: true }),
    ).toEqual({ type: "move", direction: "right" });
  });

  it("uses the same normalized event contract for Web and iPad callers", () => {
    const webEvent: CommandCenterShortcutEvent = { key: "r", repeat: false };
    const ipadEvent: CommandCenterShortcutEvent = { key: "r", repeat: false };

    expect(resolveCommandCenterShortcut(webEvent)).toEqual({ type: "reply" });
    expect(resolveCommandCenterShortcut(ipadEvent)).toEqual(
      resolveCommandCenterShortcut(webEvent),
    );
  });

  it.each([{ key: "" }, { key: null }, {}, { key: "x" }])(
    "ignores empty and unmapped input %#",
    (event) => {
      expect(resolveCommandCenterShortcut(event)).toBeNull();
    },
  );
});
