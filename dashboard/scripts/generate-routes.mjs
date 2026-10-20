import { Generator, getConfig } from "@tanstack/router-generator"

const root = process.cwd()
await new Generator({ root, config: getConfig({}, root) }).run()
