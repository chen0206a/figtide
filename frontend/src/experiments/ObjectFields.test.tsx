import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { ObjectFields } from "./ObjectFields";
import type { JsonValue } from "../lib/api";
it("rejects duplicate field names and non-finite numeric input", () => {
  const valid = vi.fn();
  const change = vi.fn();
  render(
    <ObjectFields
      label="指标"
      value={{ accuracy: 90, loss: 0.1 }}
      onChange={change}
      onValid={valid}
    />,
  );
  fireEvent.change(screen.getByLabelText("指标 2 名称"), {
    target: { value: "accuracy" },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("重复");
  expect(valid).toHaveBeenLastCalledWith(false);
  fireEvent.change(screen.getByLabelText("指标 2 名称"), {
    target: { value: "loss" },
  });
  fireEvent.change(screen.getByLabelText("指标 1 值"), {
    target: { value: "1e999" },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("有限数值");
  expect(valid).toHaveBeenLastCalledWith(false);
});
it("preserves nested JSON while switching between form and advanced mode", () => {
  function Harness() {
    const [v, setV] = useState<Record<string, JsonValue>>({
      model: { layers: [32, 64] },
      enabled: true,
    });
    return (
      <>
        <ObjectFields
          label="参数"
          value={v}
          onChange={setV}
          onValid={() => {}}
        />
        <output>{JSON.stringify(v)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "参数高级 JSON" }));
  fireEvent.change(screen.getByLabelText("参数（JSON）"), {
    target: { value: '{"model":{"layers":[64,128]},"enabled":false}' },
  });
  fireEvent.click(screen.getByRole("button", { name: "返回表单" }));
  expect(screen.getByLabelText("参数 1 值")).toHaveValue('{"layers":[64,128]}');
  expect(screen.getByLabelText("参数 2 值")).toHaveValue("false");
  expect(screen.getByRole("status")).toHaveTextContent('"enabled":false');
});
