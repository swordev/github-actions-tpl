import { confirm } from "../util/cli-util";
import { checkPath } from "../util/fs-util";
import {
  renderAction,
  OptionsType as RenderOptionsType,
} from "./render-action";
import { cyan } from "chalk";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

export type OptionsType = RenderOptionsType & {
  output: string;
};

export async function installAction(options: OptionsType) {
  const result = await renderAction(options);
  if (
    (await checkPath(options.output)) &&
    !(await confirm(`Overwrite ${cyan(options.output)}?`, true))
  ) {
    process.exit(1);
  }
  const dir = dirname(options.output);
  await mkdir(dir, {
    recursive: true,
  });
  await writeFile(options.output, result);
  console.log(`File saved into ${cyan(options.output)}`);
}
