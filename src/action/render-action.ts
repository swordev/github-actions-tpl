import {
  WorkflowType,
  parsePlatform,
  resolveOs,
} from "../util/github-actions-util";
import { nameOf } from "../util/object-util";
import { stringify, scalarOptions } from "yaml";

export type OptionsType = {
  build: {
    target: {
      os: string[];
      arch: string[];
      node?: string[];
    };
    nodePkg?: boolean;
    image?: boolean;
  };
  publish?: {
    nodePkg?: {
      registry: "gh" | "npm";
      public?: boolean;
    }[];
    release?: {
      registry: "gh";
      nodePkg?: boolean;
      image?: boolean;
    }[];
    image?: {
      registry: "gh";
    }[];
  };
};

function ifX(condition: any, text: string, elseX?: string) {
  return condition ? text : elseX ?? "";
}

type MetaType = {
  targetOs: string;
  targetNode: string;
  targetName: string;
  nodePkg: {
    owner: string;
    artifactName: string;
    fileName: string;
  };
  image: {
    artifactName: string;
    fileName: string;
  };
};
const meta = nameOf<MetaType>({
  subkeys: ["nodePkg", "image"],
  onGet: (name) => `\${{ fromJson(steps.meta.outputs.result).${name} }}`,
});

const publishMeta = nameOf<MetaType>({
  subkeys: ["nodePkg", "image"],
  onGet: (name) => `\${{ fromJson(needs.build.outputs.publish).${name} }}`,
});

export async function renderAction(options: OptionsType) {
  const workflow: WorkflowType = {
    name: "CI",
    on: {
      workflow_dispatch: null,
      push: {
        tags: ["v*"],
      },
    },
    jobs: {
      build: {
        "runs-on": "${{ matrix.os }}",
        strategy: {
          matrix: {
            os: options.build.target.os.map(resolveOs),
            arch: options.build.target.arch,
            ...(options.build.target.node && {
              node: options.build.target.node,
            }),
            include: options.build.target.os.map((os, index) => ({
              os: resolveOs(os),
              platform: parsePlatform(os),
              publish: index === 0,
            })),
          },
        },
        name: options.build.target.node
          ? "Build on node-v${{ matrix.node }}-${{ matrix.platform }}-${{ matrix.arch }}"
          : "Build on ${{ matrix.platform }}-${{ matrix.arch }}",
        outputs: {
          build: "${{ steps.meta.outputs.build }}",
          publish: "${{ steps.meta.outputs.publish }}",
          ...(!!options.publish?.image?.length && {
            publish_image_tags: "${{ steps.image-meta.outputs.tags }}",
            publish_image_labels: "${{ steps.image-meta.outputs.labels }}",
          }),
        },
        steps: [
          {
            uses: "actions/checkout@v2",
          },
          {
            id: "meta",
            name: "Build metadata",
            uses: "actions/github-script@v5",
            env: {
              REPO_NAME: "${{ github.repository }}",
              MATRIX_OS: "${{ matrix.os }}",
              MATRIX_PLATFORM: "${{ matrix.platform }}",
              MATRIX_ARCH: "${{ matrix.arch }}",
              MATRIX_PUBLISH: "${{ matrix.publish }}",
              ...(options.build.target.node && {
                MATRIX_NODE: "${{ matrix.node }}",
              }),
            },
            with: {
              script: `
                const env = process.env;
                const result = {};
                result.targetOs = env.MATRIX_OS;
                ${ifX(
                  options.build.target.node?.length,
                  "result.targetNode = env.MATRIX_NODE;"
                )}
                result.targetName = ${ifX(
                  options.build.target.node?.length,
                  `"node-v" + env.MATRIX_NODE + "-" + env.MATRIX_PLATFORM + "-" + env.MATRIX_ARCH`,
                  `env.MATRIX_PLATFORM + "-" + env.MATRIX_ARCH`
                )};
                ${ifX(
                  options.build.nodePkg,
                  `
                  const pkg = require('./package.json');
                  const [pkgNameOwner, pkgName] = pkg.name.slice(1).split("/");
                  result.nodePkg = {};
                  result.nodePkg.owner = pkgNameOwner;
                  const pkgFullName = pkgNameOwner + "-" + pkgName + "-v" + pkg.version;
                  result.nodePkg.artifactName = pkgFullName + "-" + result.targetName + ".nodepkg";
                  result.nodePkg.fileName = result.nodePkg.artifactName + ".tgz";
                  `
                )}
                ${ifX(
                  options.build.image,
                  `
                  const [repoOwner, repoName] = env.REPO_NAME.split("/");
                  const repoVersion = context.payload.ref.replace(/^refs\\/tags\\/v?/, '');
                  result.image = {};
                  result.image.name = repoOwner + "-" + repoName + "-v" + repoVersion;
                  result.image.artifactName = result.image.name + "-" + result.targetName + ".image";
                  result.image.fileName = result.image.artifactName + ".tar";
                `
                )}
                if (env.MATRIX_PUBLISH)
                  core.setOutput('publish', result);
                return result;
              `
                .split(/\n/g)
                .map((v) => v.trim())
                .filter((v) => !!v.length)
                .join("\n"),
            },
          },
          ...(options.build.nodePkg
            ? [
                {
                  uses: "actions/setup-node@v2",
                },
                {
                  uses: "bahmutov/npm-install@v1",
                },
              ]
            : []),
          ...(options.build.nodePkg
            ? [
                {
                  run: "mkdir -p /tmp/artifact/nodepkg",
                },
                {
                  name: "Test Node.js pkg",
                  run: "npm run test --if-present",
                },
                {
                  name: "Pack Node.js pkg",
                  run: [
                    "npm pack",
                    `mv *.tgz /tmp/artifact/nodepkg/${meta.nodePkg.fileName}`,
                  ].join("\n"),
                },
                {
                  name: "Upload Node.js pkg",
                  uses: "actions/upload-artifact@v2",
                  with: {
                    name: meta.nodePkg.artifactName,
                    path: "/tmp/artifact/nodepkg/*",
                    "if-no-files-found": "error",
                    "retention-days": 7,
                  },
                },
              ]
            : []),
          ...(options.build.image
            ? [
                {
                  run: "mkdir -p /tmp/artifact/image",
                },
                {
                  id: "image-meta",
                  name: "Build image metadata",
                  uses: "docker/metadata-action@v3",
                  with: {
                    images: ["ghcr.io/${{ github.repository }}"].join("\n"),
                    tags: [
                      "type=schedule",
                      "type=ref,event=branch",
                      "type=ref,event=pr",
                      "type=semver,pattern={{version}}",
                      "type=semver,pattern={{major}}.{{minor}}",
                      "type=semver,pattern={{major}}",
                      "type=sha",
                    ].join("\n"),
                  },
                },
                {
                  name: "Set up Docker Buildx",
                  uses: "docker/setup-buildx-action@v1",
                },
                {
                  name: "Build image",
                  uses: "docker/build-push-action@v2",
                  with: {
                    tags: "${{ steps.image-meta.outputs.tags }}",
                    labels: "${{ steps.image-meta.outputs.labels }}",
                    outputs: `type=docker,dest=/tmp/artifact/image/${meta.image.fileName}`,
                  },
                },
                {
                  name: "Upload image",
                  uses: "actions/upload-artifact@v2",
                  with: {
                    name: meta.image.artifactName,
                    path: "/tmp/artifact/image/*",
                    "if-no-files-found": "error",
                    "retention-days": 7,
                  },
                },
              ]
            : []),
        ],
      },
      ...(options.publish?.release ?? []).reduce((result, publish) => {
        result[`publish-github-release`] = {
          if: "startsWith(github.ref, 'refs/tags/')",
          "runs-on": "ubuntu-latest",
          needs: ["build"],
          name: "Publish release in GitHub",
          steps: [
            {
              name: "Create",
              uses: "softprops/action-gh-release@v1",
              env: {
                GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
              },
            },
            ...(publish.nodePkg
              ? [
                  {
                    run: "mkdir -p /tmp/artifact/nodepkg",
                  },
                  {
                    name: "Download Node.js pkg",
                    uses: "actions/download-artifact@v2",
                    with: {
                      path: "/tmp/artifact/nodepkg",
                    },
                  },
                  {
                    name: "Attach Node.js pkg",
                    uses: "softprops/action-gh-release@v1",
                    env: {
                      GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
                    },
                    with: {
                      files: "/tmp/artifact/nodepkg/**/*.tgz",
                    },
                  },
                ]
              : []),
            ...(publish.image
              ? [
                  {
                    run: "mkdir -p /tmp/artifact/image",
                  },
                  {
                    name: "Download image",
                    uses: "actions/download-artifact@v2",
                    with: {
                      path: "/tmp/artifact/image",
                    },
                  },
                  {
                    name: "Attach image",
                    uses: "softprops/action-gh-release@v1",
                    env: {
                      GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
                    },
                    with: {
                      files: "/tmp/artifact/image/**/*.tar",
                    },
                  },
                ]
              : []),
          ],
        };
        return result;
      }, {} as Record<string, WorkflowType["jobs"][number]>),
      ...(options.publish?.nodePkg ?? []).reduce((result, publish) => {
        result[
          `publish-${publish.registry === "gh" ? "github" : "npm"}-nodepkg`
        ] = {
          if: "startsWith(github.ref, 'refs/tags/')",
          "runs-on": publishMeta.targetOs,
          needs: ["build"],
          name: `Publish Node.js pkg in ${
            publish.registry === "gh" ? "GitHub" : "NPM"
          }`,
          steps: [
            {
              name: "Download",
              uses: "actions/download-artifact@v2",
              with: {
                name: publishMeta.nodePkg.artifactName,
              },
            },
            {
              uses: "actions/setup-node@v2",
              with: {
                scope: `@${publishMeta.nodePkg.owner}`,
                "node-version": `${publishMeta.targetNode}`,
                "registry-url":
                  publish.registry === "gh"
                    ? "https://npm.pkg.github.com"
                    : "https://registry.npmjs.org",
              },
            },
            {
              name: "Publish",
              run: `npm publish ${publishMeta.nodePkg.fileName} ${
                publish.public ? ` --access public` : ""
              }`,
              env: {
                NODE_AUTH_TOKEN:
                  publish.registry === "gh"
                    ? "${{ secrets.GITHUB_TOKEN }}"
                    : "${{ secrets.NPM_TOKEN }}",
              },
            },
          ],
        };
        return result;
      }, {} as Record<string, WorkflowType["jobs"][number]>),
      ...(options.publish?.image?.some(
        (publish) => publish.registry === "gh"
      ) && {
        "publish-github-image": {
          if: "startsWith(github.ref, 'refs/tags/')",
          "runs-on": "ubuntu-latest",
          needs: ["build"],
          name: "Publish image in GitHub",
          steps: [
            {
              run: "mkdir -p /tmp/artifact/image",
            },
            {
              name: "Download",
              uses: "actions/download-artifact@v2",
              with: {
                name: publishMeta.image.artifactName,
                path: "/tmp/artifact/image",
              },
            },
            {
              name: "Load",
              run: [
                `docker load --input /tmp/artifact/image/${publishMeta.image.fileName}`,
              ].join("\n"),
            },
            {
              name: "Login",
              uses: "docker/login-action@v1",
              with: {
                registry: "ghcr.io",
                username: "${{ github.actor }}",
                password: "${{ secrets.GITHUB_TOKEN }}",
              },
            },
            {
              name: "Publish",
              uses: "docker/build-push-action@v2",
              with: {
                tags: "${{ needs.build.outputs.publish_image_tags }}",
                labels: "${{ needs.build.outputs.publish_image_labels }}",
                push: true,
              },
            },
          ],
        },
      }),
    },
  };
  const lineWidth = scalarOptions.str.fold.lineWidth;
  try {
    scalarOptions.str.fold.lineWidth = 120;
    return stringify(workflow);
  } finally {
    scalarOptions.str.fold.lineWidth = lineWidth;
  }
}
