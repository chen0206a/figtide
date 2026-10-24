import { describe, expect, it } from "vitest";
import { isEditingTarget, shouldToggleAssistant } from "./agentShortcut";

function press(init: KeyboardEventInit, target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", init);
  Object.defineProperty(event, "target", { value: target });
  return event;
}

function field(tag: string, contentEditable = false): HTMLElement {
  const element = document.createElement(tag);
  if (contentEditable) Object.defineProperty(element, "isContentEditable", { value: true });
  return element;
}

describe("assistant shortcut", () => {
  it("toggles on Option+A outside a field, even when the character is å", () => {
    expect(shouldToggleAssistant(press({ altKey: true, code: "KeyA", key: "å" }, document.body))).toBe(true);
  });

  it("never fires while an input, textarea or contenteditable has focus", () => {
    for (const target of [field("input"), field("textarea"), field("select"), field("div", true)]) {
      expect(shouldToggleAssistant(press({ altKey: true, code: "KeyA", key: "å" }, target))).toBe(false);
      expect(isEditingTarget(target)).toBe(true);
    }
  });

  it("ignores other modifiers and other keys", () => {
    expect(shouldToggleAssistant(press({ altKey: true, ctrlKey: true, code: "KeyA" }, document.body))).toBe(false);
    expect(shouldToggleAssistant(press({ altKey: true, metaKey: true, code: "KeyA" }, document.body))).toBe(false);
    expect(shouldToggleAssistant(press({ altKey: true, code: "KeyQ" }, document.body))).toBe(false);
    expect(shouldToggleAssistant(press({ code: "KeyA" }, document.body))).toBe(false);
  });

  it("treats a link or plain text target as non-editing", () => {
    expect(isEditingTarget(field("a"))).toBe(false);
    expect(shouldToggleAssistant(press({ altKey: true, code: "KeyA" }, field("a")))).toBe(true);
  });
});