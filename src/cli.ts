import { installAction } from "./action/install-action";
import { renderAction } from "./action/render-action";
import { checkPath, requireFile } from "./util/fs-util";
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

export function parseBooleanOption(value: string) {
  value = value.trim().toLowerCase();
  return value === "true" || value === "1";
}

export function parseNodePublishOption(values: string[]) {
  return values?.map((v) => {
    const [registry, flag] = v.split(":");
    if (!["gh", "npm"].includes(registry))
      throw new Error(`Invalid node registry: ${registry}`);
    if (flag && flag !== "public")
      throw new Error(`Invalid node registry flag: ${flag}`);
    return {
      registry: registry as "gh" | "npm",
      public: flag === "public",
    };
  });
}

export function parseRenderActionOptions(options: {
  buildTargetOs?: string[];
  buildTargetArch?: string[];
  buildTargetNode?: string[];
  buildNodepkg?: boolean;
  publishNodepkg?: string[];
  buildImage?: boolean;
  publishImage?: string[];
  publishRelease?: string[];
  publishReleaseNodepkg?: boolean;
  publishReleaseImage?: boolean;
}) {
  return {
    build: {
      target: {
        os: options.buildTargetOs ?? [],
        arch: options.buildTargetArch ?? [],
        node: options.buildTargetNode?.length
          ? options.buildTargetNode
          : undefined,
      },
      nodePkg: options.buildNodepkg,
      image: options.buildImage,
    },
    publish: {
      nodePkg: options.publishNodepkg
        ? parseNodePublishOption(options.publishNodepkg)
        : undefined,
      release: options.publishRelease?.map((registry) => ({
        registry,
        nodePkg: options.publishReleaseNodepkg,
        image: options.publishReleaseImage,
      })),
      image: options.publishImage?.map((registry) => ({
        registry,
      })),
    },
  } as Parameters<typeof renderAction>[0];
}

export function addRenderOptions(
  command: Command,
  pkg: PackageType | undefined,
  dockerfile?: boolean
) {
  return command
    .option(
      "--build-target-os [values]",
      "OSs build target (values: linux, win, mac or any GitHub-hosted runner)",
      parseStringListOption,
      ["linux"]
    )
    .option(
      "--build-target-arch [archs]",
      "Archs build target",
      parseStringListOption,
      ["x64"]
    )
    .option(
      "--build-target-node [versions]",
      "Node.js build target",
      parseStringListOption,
      pkg
        ? pkg.engines?.node
          ? [minVersion(pkg?.engines.node)?.version]
          : ["16"]
        : []
    )
    .option(
      "--build-nodepkg [enabled]",
      "Build Node.js package (values: true, false)",
      parseBooleanOption,
      !!pkg
    )
    .option(
      "--build-image [enabled]",
      "Build image (values: true, false)",
      parseBooleanOption,
      !!dockerfile
    )
    .option(
      "--publish-nodepkg [registries]",
      "Publish Node.js package (registries: gh, npm, gh:public, npm:public)",
      parseStringListOption,
      pkg ? ["gh:public", "npm:public"] : []
    )
    .option(
      "--publish-image [registries]",
      "Publish image (registries: gh)",
      parseStringListOption,
      dockerfile ? ["gh"] : []
    )
    .option(
      "--publish-release [registries]",
      "Publish release (registries: gh)",
      parseStringListOption,
      ["gh"]
    )
    .option(
      "--publish-release-nodepkg [enabled]",
      "Publish Node.js package artifacts (values: true, false)",
      parseBooleanOption,
      !!pkg
    )
    .option(
      "--publish-release-image [enabled]",
      "Publish image artifacts (values: true, false)",
      parseBooleanOption,
      !!dockerfile
    );
}

export default async () => {
  const pkg = await requireFile<PackageType>("./package.json", true);
  const dockerfile = await checkPath("Dockerfile");

  const renderCommand = program.command("render");
  addRenderOptions(renderCommand, pkg, dockerfile);
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
  addRenderOptions(installCommand, pkg, dockerfile);
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
