#!/usr/bin/env node
import cli from "./cli";

async function main() {
  const program = await cli();
  program.parse(process.argv);
}

main();
