export type ImportShapeReason = "prose-column" | "single-row";

export type ImportShapeCheck = {
  /** 这份文件是否像一个表格。 */
  looksLikeTable: boolean;
  /** 不像表格时，命中的是哪条规则。 */
  reason: ImportShapeReason | null;
};

const SENTENCE_MARKS = /[。，、；？！]/;

/**
 * 上传文件的形态体检：把"散文被当成一列表格"和"只有一行数据"这两种情况
 * 明确标出来，由用户决定是否继续导入。纯函数，便于单测。
 */
export function checkImportShape(input: {
  fieldNames: string[];
  rowCount: number;
}): ImportShapeCheck {
  const named = input.fieldNames.filter((name) => name.trim() !== "");
  if (
    named.length === 1 &&
    (named[0].trim().length > 30 || SENTENCE_MARKS.test(named[0]))
  )
    return { looksLikeTable: false, reason: "prose-column" };
  if (input.rowCount <= 1) return { looksLikeTable: false, reason: "single-row" };
  return { looksLikeTable: true, reason: null };
}

export function shapeWarning(check: ImportShapeCheck): string {
  if (check.reason === "single-row")
    return "这份文件只有一行数据，可能缺少表头或分隔符。请检查文件格式或分隔符设置。";
  return "这份文件看起来不是表格：只识别出 1 列，也没有找到分隔符。请检查文件格式或分隔符设置。";
}