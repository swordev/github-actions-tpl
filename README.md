# github-actions-tpl

> CLI tool for creating GitHub Actions Workflow automatically

## Features

- Auto-options based on the target project.
- Publishes GitHub releases with artifacts.
- Publishes Node.js packages (GitHub, NPM).
- Separated workflow jobs:
  - `build`
    - `publish-github-release`
    - `publish-github-package`
    - `publish-npm-package`

## Usage

```sh
npx @swordev/github-actions-tpl --help
```
