import { stat } from "fs/promises";
import { isAbsolute } from "path";
import { join } from "path";

export async function requireFile<T>(
  path: string,
  optional?: false
): Promise<T>;
export async function requireFile<T>(
  path: string,
  optional: true
): Promise<T | undefined>;
export async function requireFile<T>(
  path: string,
  optional?: boolean
): Promise<T | undefined> {
  const absPath = isAbsolute(path) ? path : join(process.cwd(), path);
  try {
    return require(absPath);
  } catch (error) {
    if (
      optional &&
      (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND"
    )
      return;
    throw error;
  }
}

export async function checkPath(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    return false;
  }
}
