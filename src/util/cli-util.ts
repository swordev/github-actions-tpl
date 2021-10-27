import { cyan, grey } from "chalk";
import * as readline from "readline";

export function confirm(message: string, defaults?: boolean) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      `${cyan("?")} ${message} (${grey(defaults ? "Y/n" : "N/y")}): `,
      (answer) => {
        answer = answer.toLowerCase().trim();
        rl.close();
        if (typeof defaults === "boolean" && !answer.length)
          return resolve(defaults);
        resolve(answer === "y" || answer === "yes");
      }
    );
  });
}
