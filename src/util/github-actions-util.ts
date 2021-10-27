export const platforms = ["linux", "mac", "win"] as const;
export type PlatformType = typeof platforms[number];

export type WorkflowType = {
  name: string;
  on: {
    workflow_dispatch: any;
    push: {
      tags: string[];
    };
  };
  jobs: Record<
    string,
    {
      "runs-on": string;
      strategy?: {
        matrix: Record<
          string,
          (string | number | Record<string, string | boolean | number>)[]
        >;
      };
      name: string;
      if?: string;
      needs?: string[];
      outputs?: Record<string, string>;
      steps: {
        id?: string;
        if?: string;
        name?: string;
        uses?: string;
        with?: Record<string, string | number | boolean>;
        env?: Record<string, string>;
        run?: string;
      }[];
    }
  >;
};

export function resolveOs(platformOrOs: string) {
  if (platformOrOs === "linux") {
    return "ubuntu-latest";
  } else if (platformOrOs === "mac") {
    return "macos-latest";
  } else if (platformOrOs === "win") {
    return "windows-latest";
  } else {
    return platformOrOs;
  }
}

export function parsePlatform(platformOrOs: string): PlatformType {
  if (platforms.includes(platformOrOs as any)) {
    return platformOrOs as any;
  } else if (platformOrOs.startsWith("ubuntu-")) {
    return "linux";
  } else if (platformOrOs.startsWith("macos-")) {
    return "mac";
  } else if (platformOrOs.startsWith("windows-")) {
    return "win";
  } else {
    throw new Error(`Invalid os: ${platformOrOs}`);
  }
}
