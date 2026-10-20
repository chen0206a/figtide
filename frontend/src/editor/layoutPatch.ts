type Plain = Record<string, any>;
const object = (value: unknown): value is Plain =>
  !!value && typeof value === "object" && !Array.isArray(value);
/** Plotly relayout merges objects. Explicit nulls must clear removed range, type,
 * tick and legend attributes, otherwise resetting the inspector leaves stale axes. */
export function layoutPatch(previous: Plain, next: Plain): Plain {
  const patch: Plain = {};
  function visit(a: Plain, b: Plain, prefix = "") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const path = prefix ? `${prefix}.${key}` : key,
        old = a[key],
        value = b[key];
      if (Object.is(old, value)) continue;
      if (object(old) && object(value)) visit(old, value, path);
      else if (
        Array.isArray(old) &&
        Array.isArray(value) &&
        JSON.stringify(old) === JSON.stringify(value)
      )
        continue;
      else patch[path] = value === undefined ? null : structuredClone(value);
    }
  }
  visit(previous, next);
  return patch;
}
