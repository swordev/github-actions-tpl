import { installAction } from "./action/install-action";
import { renderAction } from "./action/render-action";
import { requireFile } from "./util/fs-util";
import { red } from "chalk";
import { Command, program } from "commander";
import { minVersion } from "semver";

type PackageType = {
  engines?: {
    node?: string;
  };
};

function makeAction(cb: (...args: any[]) => Promise<any>) {
  return async (...args: any[]) => {
    try {
      const result: {
        exitCode?: number;
      } = await cb(...args);
      if (typeof result?.exitCode === "number") process.exit(result.exitCode);
    } catch (error) {
      console.error(red((error as Error).stack));
      process.exit(1);
    }
  };
}

export function parseStringListOption(value: string) {
  return value.split(",").map((v) => v.trim());
}

export function parseNodePublishOption(values: string[]) {
  return values?.map((v) => {
    const [name, flag] = v.split(":");
    if (!["gh", "npm"].includes(name))
      throw new Error(`Invalid node registry: ${name}`);
    if (flag && flag !== "public")
      throw new Error(`Invalid node registry flag: ${flag}`);
    return {
      name: name as "gh" | "npm",
      public: flag === "public",
    };
  });
}

export function parseRenderActionOptions(options: {
  buildOs?: string[];
  buildArch?: string[];
  buildNode?: string[];
  nodeRegistry?: string[];
  releaseRegistry?: string[];
}) {
  return {
    build: {
      os: options.buildOs ?? [],
      arch: options.buildArch ?? [],
      node: options.buildNode ?? [],
    },
    node: options.buildNode?.length
      ? {
          registries: options.nodeRegistry
            ? parseNodePublishOption(options.nodeRegistry)
            : undefined,
        }
      : undefined,
    release: {
      registries: options.releaseRegistry as any,
    },
  } as Parameters<typeof renderAction>[0];
}

export function addRenderOptions(
  command: Command,
  pkg: PackageType | undefined
) {
  return command
    .option(
      "--build-os [values]",
      "Build OSs (values: linux, win, mac or any GitHub-hosted runner)",
      parseStringListOption,
      ["linux"]
    )
    .option("--build-arch [archs]", "Build archs", parseStringListOption, [
      "x64",
    ])
    .option(
      "--build-node [versions]",
      "Node.js versions",
      parseStringListOption,
      pkg
        ? pkg.engines?.node
          ? [minVersion(pkg?.engines.node)?.version]
          : ["16"]
        : []
    )
    .option(
      "--node-registry [registries]",
      "Node.js package registries (registries: gh, npm, gh:public, npm:public)",
      parseStringListOption,
      pkg ? ["gh:public", "npm:public"] : []
    )
    .option(
      "--release-registry [registries]",
      "Release registries (registries: gh)",
      parseStringListOption,
      ["gh"]
    );
}

export default async () => {
  const pkg = await requireFile<PackageType>("./package.json", true);

  const renderCommand = program.command("render");
  addRenderOptions(renderCommand, pkg);
  renderCommand.action(
    makeAction(async (options) => {
      const renderOptions = parseRenderActionOptions(options);
      const result = await renderAction(renderOptions);
      console.log(result);
    })
  );

  const installCommand = program
    .command("install")
    .requiredOption(
      "-o,--output [path]",
      "Output path",
      ".github/workflows/ci.yaml"
    );
  addRenderOptions(installCommand, pkg);
  installCommand.action(
    makeAction(async (options: { output: string }) => {
      const renderOptions = parseRenderActionOptions(options as any);
      await installAction({
        ...renderOptions,
        output: options.output,
      });
    })
  );

  return program;
};
