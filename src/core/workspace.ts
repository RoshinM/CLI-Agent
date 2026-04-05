import fs from "fs";
import path from "path";

function normalizeCandidate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getWorkspaceArg(): string | null {
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--workspace") {
      return normalizeCandidate(args[index + 1]);
    }

    if (current.startsWith("--workspace=")) {
      return normalizeCandidate(current.slice("--workspace=".length));
    }
  }

  return null;
}

export function getWorkspaceRoot(): string {
  const configuredWorkspace =
    getWorkspaceArg() ??
    normalizeCandidate(process.env.AGENT_WORKSPACE) ??
    normalizeCandidate(process.env.INIT_CWD) ??
    process.cwd();

  const resolved = path.resolve(configuredWorkspace);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Workspace root does not exist: ${resolved}`);
  }

  const stats = fs.statSync(resolved);
  if (!stats.isDirectory()) {
    throw new Error(`Workspace root must be a directory: ${resolved}`);
  }

  return resolved;
}

export function resolveWorkspacePath(relativePath: string): string {
  return path.resolve(getWorkspaceRoot(), relativePath);
}

export function isWithinWorkspace(targetPath: string): boolean {
  const workspaceRoot = getWorkspaceRoot();
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(workspaceRoot, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function toWorkspaceRelativePath(targetPath: string): string {
  const relative = path.relative(getWorkspaceRoot(), targetPath);
  return relative ? relative.replace(/\\/g, "/") : ".";
}
