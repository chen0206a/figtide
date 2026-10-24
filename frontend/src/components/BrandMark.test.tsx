import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BrandMark } from "./BrandMark";
import icon from "../assets/brand/figtide-icon.svg";
import smallIcon from "../assets/brand/figtide-icon-small.svg";
import reverseIcon from "../assets/brand/figtide-icon-reverse.svg";

it("uses the small icon through 24 px and the full icon above 24 px", () => {
  const { container, rerender } = render(<BrandMark size={24} />);
  expect(container.querySelector("img")).toHaveAttribute("src", smallIcon);
  expect(screen.getByRole("img", { name: "FigTide" })).toBeVisible();
  expect(container.querySelector("img")).toHaveAttribute("alt", "");
  rerender(<BrandMark size={25} />);
  expect(container.querySelector("img")).toHaveAttribute("src", icon);
});

it("uses the reverse icon on dark surfaces and optionally shows the Chinese wordmark", () => {
  const { container } = render(<BrandMark size={20} tone="light" showCn />);
  expect(container.querySelector("img")).toHaveAttribute("src", reverseIcon);
  expect(screen.getByText("图汐")).toBeVisible();
  expect(screen.getByRole("img")).toHaveAccessibleName("FigTide");
});
