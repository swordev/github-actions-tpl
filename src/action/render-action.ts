import {
  WorkflowType,
  parsePlatform,
  resolveOs,
} from "../util/github-actions-util";
import { stringify, scalarOptions } from "yaml";

export type OptionsType = {
  build: {
    os: string[];
    arch: string[];
    node?: string[];
  };
  node?: {
    package: {
      name: string;
    };
    registries?: {
      name: "gh" | "npm";
      public?: boolean;
    }[];
  };
  release?: {
    registries: "gh"[];
  };
};

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
            os: options.build.os.map(resolveOs),
            arch: options.build.arch,
            ...(options.build.node && {
              node: options.build.node,
            }),
            include: options.build.os.map((os, index) => ({
              os: resolveOs(os),
              platform: parsePlatform(os),
              publish: index === 0,
            })),
          },
        },
        name: options.node
          ? "Build on node-v${{ matrix.node }}-${{ matrix.platform }}-${{ matrix.arch }}"
          : "Build on ${{ matrix.platform }}-${{ matrix.arch }}",
        outputs: {
          publish_build_os: "${{ steps.publish-var.outputs.build_os }}",
          publish_build_arch: "${{ steps.publish-var.outputs.build_arch }}",
          publish_build_name: "${{ steps.publish-var.outputs.build_name }}",
          ...(options.node && {
            publish_build_node: "${{ steps.publish-var.outputs.build_node }}",
            publish_pkg_scope: "${{ steps.publish-var.outputs.pkg_scope }}",
            publish_pkg_build_name:
              "${{ steps.publish-var.outputs.pkg_build_name }}",
          }),
        },
        steps: [
          {
            uses: "actions/checkout@v2",
          },
          ...(options.node
            ? [
                {
                  uses: "actions/setup-node@v2",
                },
                {
                  uses: "bahmutov/npm-install@v1",
                },
              ]
            : []),
          {
            id: "build-var",
            run: [
              ...(options.node
                ? [
                    `BUILD_NAME=node-v\${{ matrix.node }}-\${{ matrix.platform }}-\${{ matrix.arch }}`,
                  ]
                : [`BUILD_NAME=\${{ matrix.platform }}-\${{ matrix.arch }}`]),
              `echo "::set-output name=build_name::\${BUILD_NAME}"`,
              ...(options.node
                ? [
                    `PKG_SCOPE=$(node -e "console.log(require('./package.json').name.split('/').shift().slice(1))")`,
                    `PKG_NAME=$(node -e "console.log(require('./package.json').name.split('/').pop())")`,
                    `PKG_VERSION=$(node -e "console.log(require('./package.json').version)")`,
                    `echo "::set-output name=pkg_scope::\${PKG_SCOPE}"`,
                    `echo "::set-output name=pkg_name::\${PKG_NAME}"`,
                    `echo "::set-output name=pkg_version::\${PKG_VERSION}"`,
                    `echo "::set-output name=pkg_build_name::\${PKG_SCOPE}-\${PKG_NAME}-v\${PKG_VERSION}-\${BUILD_NAME}.tgz"`,
                  ]
                : []),
            ].join("\n"),
          },
          {
            id: "publish-var",
            if: "matrix.publish",
            run: [
              ...(options.node
                ? [
                    `echo "::set-output name=pkg_scope::\${{ steps.build-var.outputs.pkg_scope }}"`,
                    `echo "::set-output name=pkg_build_name::\${{ steps.build-var.outputs.pkg_build_name }}"`,
                  ]
                : []),
              `echo "::set-output name=build_os::\${{ matrix.os }}"`,
              `echo "::set-output name=build_arch::\${{ matrix.arch }}"`,
              `echo "::set-output name=build_node::\${{ matrix.node }}"`,
              `echo "::set-output name=build_name::\${{ steps.build-var.outputs.build_name }}"`,
            ].join("\n"),
          },
          ...(options.node
            ? [
                {
                  name: "Test",
                  run: "npm run test --if-present",
                },
                {
                  name: "Pack",
                  run: [
                    "npm pack",
                    "mv *.tgz ${{ steps.build-var.outputs.pkg_build_name }}",
                  ].join("\n"),
                },
              ]
            : []),
          {
            name: "Upload",
            uses: "actions/upload-artifact@v2",
            with: {
              name: "${{ steps.build-var.outputs.build_name }}",
              path: "*.tgz",
              "if-no-files-found": "error",
              "retention-days": 7,
            },
          },
        ],
      },
      ...(options.release?.registries?.includes("gh") && {
        "publish-github-release": {
          if: "startsWith(github.ref, 'refs/tags/')",
          "runs-on": "ubuntu-latest",
          needs: ["build"],
          name: "Publish GitHub release",
          steps: [
            {
              name: "Download",
              uses: "actions/download-artifact@v2",
            },
            {
              name: "Create",
              uses: "softprops/action-gh-release@v1",
              env: {
                GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
              },
              with: {
                files: "**/*.tgz",
              },
            },
          ],
        },
      }),
      ...(options.node?.registries ?? []).reduce((result, publish) => {
        result[`publish-${publish.name === "gh" ? "github" : "npm"}-package`] =
          {
            if: "startsWith(github.ref, 'refs/tags/')",
            "runs-on": "${{ needs.build.outputs.publish_build_os }}",
            needs: ["build"],
            name: `Publish ${publish.name === "gh" ? "GitHub" : "NPM"} package`,
            steps: [
              {
                name: "Download",
                uses: "actions/download-artifact@v2",
                with: {
                  name: "${{ needs.build.outputs.publish_build_name }}",
                },
              },
              {
                uses: "actions/setup-node@v2",
                with: {
                  scope: "@${{ needs.build.outputs.publish_pkg_scope }}",
                  "node-version":
                    "${{ needs.build.outputs.publish_build_node }}",
                  "registry-url":
                    publish.name === "gh"
                      ? "https://npm.pkg.github.com"
                      : "https://registry.npmjs.org",
                },
              },
              {
                name: "Publish",
                run: `npm publish \${{ needs.build.outputs.publish_pkg_build_name }}${
                  publish.public ? ` --access public` : ""
                }`,
                env: {
                  NODE_AUTH_TOKEN:
                    publish.name === "gh"
                      ? "${{ secrets.GITHUB_TOKEN }}"
                      : "${{ secrets.NPM_TOKEN }}",
                },
              },
            ],
          };
        return result;
      }, {} as Record<string, any>),
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
