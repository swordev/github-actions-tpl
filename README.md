[![CI](https://github.com/swordev/github-actions-tpl/actions/workflows/ci.yaml/badge.svg)](https://github.com/swordev/github-actions-tpl/actions/workflows/ci.yaml)

# github-actions-tpl

> CLI tool for creating GitHub Actions Workflow automatically with minimal config

## Features

- Auto-options based on the target project (package.json, Dockerfile).
- Auto-triggers workflow when pushes a new version tag.
- Publishes GitHub releases with artifacts (Node.js package, image).
- Publishes Node.js packages (GitHub, NPM).
- Publishes images (GitHub).
- Separated workflow jobs:
  - `build`
    - `publish-github-release`
    - `publish-github-nodepkg`
    - `publish-github-image`
    - `publish-npm-nodepkg`

## Usage

```sh
npx @swordev/github-actions-tpl --help
```
