import { createPatch } from "diff";
import pc from "picocolors";

export function generateUnifiedDiff(
  fileName: string,
  oldStr: string,
  newStr: string
): string {
  return createPatch(fileName, oldStr, newStr, "original", "modified");
}

export function formatColoredDiff(diffText: string): string {
  const lines = diffText.split("\n");
  return lines
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) {
        return pc.bold(line);
      }
      if (line.startsWith("@@")) {
        return pc.cyan(line);
      }
      if (line.startsWith("+")) {
        return pc.green(line);
      }
      if (line.startsWith("-")) {
        return pc.red(line);
      }
      return line;
    })
    .join("\n");
}
