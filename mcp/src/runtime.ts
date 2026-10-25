export function requireSupportedNode(version = process.versions.node): void {
  const major = Number(version.split(".")[0]);
  if (!Number.isInteger(major) || major < 18)
    throw new Error(`FigTide MCP 需要 Node.js 18 或更高版本（当前 ${version}）`);
}
