---
name: Managed workflow package-manager commands
description: Keep managed workflows from prompting for a package-manager bootstrap.
---

Managed workflows should invoke the workspace package manager directly inside package scripts rather than nesting `npx pnpm`; nested bootstrap commands can prompt for confirmation and make an otherwise healthy workflow appear failed.

**Why:** The API workflow failed before application startup because its development script asked `npx` to install pnpm interactively.

**How to apply:** In pnpm workspaces, use `pnpm` for nested workspace/package commands and reserve `npx` for tools that are intentionally executed through npm's package runner.