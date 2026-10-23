import { describe, expect, it } from "vitest";
import { checkImportShape, shapeWarning } from "./importChecks";

const names = (value: string) => [value];

describe("checkImportShape", () => {
  it("flags prose that was read as a single column", () => {
    const check = checkImportShape({
      fieldNames: names("这是一份实验记录，不是表格。第二行也没有逗号分隔。"),
      rowCount: 3,
    });
    expect(check).toEqual({ looksLikeTable: false, reason: "prose-column" });
    expect(shapeWarning(check)).toContain("只识别出 1 列");
  });

  it("flags a long column name without punctuation", () => {
    expect(
      checkImportShape({
        fieldNames: names("this column is a whole sentence written without breaks"),
        rowCount: 4,
      }).reason,
    ).toBe("prose-column");
  });

  it("flags a single data row", () => {
    expect(
      checkImportShape({ fieldNames: ["epoch", "accuracy"], rowCount: 1 }),
    ).toEqual({ looksLikeTable: false, reason: "single-row" });
    expect(
      shapeWarning({ looksLikeTable: false, reason: "single-row" }),
    ).toContain("只有一行数据");
  });

  it("accepts a real single-column table", () => {
    expect(
      checkImportShape({ fieldNames: ["accuracy"], rowCount: 20 }),
    ).toEqual({ looksLikeTable: true, reason: null });
  });

  it("accepts a normal multi-column table", () => {
    expect(
      checkImportShape({
        fieldNames: ["epoch", "accuracy", "loss"],
        rowCount: 12,
      }).looksLikeTable,
    ).toBe(true);
  });

  it("accepts a long column name that carries a period", () => {
    expect(
      checkImportShape({
        fieldNames: ["accuracy"],
        rowCount: 8,
      }).looksLikeTable,
    ).toBe(true);
  });
});