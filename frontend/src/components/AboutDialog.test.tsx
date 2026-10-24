import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { version } from "../../package.json";
import { AboutDialog } from "./AboutDialog";

it("shows the version injected from package.json and the chosen license", () => {
  render(<MemoryRouter><AboutDialog open onOpenChange={() => {}} /></MemoryRouter>);
  expect(screen.getByRole("dialog", { name: "关于 FigTide 图汐" })).toBeVisible();
  expect(screen.getByText(`版本 ${version}`)).toBeVisible();
  expect(screen.getByRole("link", { name: "MIT License" })).toHaveAttribute("href", "https://github.com/chen0206a/figtide/blob/main/LICENSE");
});
