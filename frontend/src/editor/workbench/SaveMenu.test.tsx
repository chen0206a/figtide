import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SaveMenu } from "./SaveMenu";

it("supports arrow navigation, Escape and explicit copy selection", () => {
  const copy = vi.fn();
  render(<SaveMenu disabled={false} onSaveCopy={copy} />);
  const trigger = screen.getByRole("button", { name: "更多保存选项" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const item = screen.getByRole("menuitem", { name: "另存副本" });
  expect(item).toHaveFocus();
  expect(copy).not.toHaveBeenCalled();
  fireEvent.keyDown(item, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("menuitem"), { key: "ArrowUp" });
  fireEvent.click(screen.getByRole("menuitem"));
  expect(copy).toHaveBeenCalledOnce();
});
it("dismisses outside without saving and respects a disabled save action", () => {
  const copy = vi.fn();
  const view = render(<SaveMenu disabled={false} onSaveCopy={copy} />);
  fireEvent.click(screen.getByRole("button", { name: "更多保存选项" }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(copy).not.toHaveBeenCalled();
  view.rerender(<SaveMenu disabled={true} onSaveCopy={copy} />);
  expect(screen.getByRole("button", { name: "更多保存选项" })).toBeDisabled();
});
