import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";

export async function appendJsonl(
  filePath: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  await appendFile(filePath, line, "utf8");
}

export function createJsonlWriter(filePath: string): {
  append: (value: unknown) => Promise<void>;
} {
  return {
    append: (value) => appendJsonl(filePath, value)
  };
}
