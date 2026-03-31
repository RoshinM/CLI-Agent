import fs from "fs";
import path from "path";
import { undoManager } from "../core/UndoManager.ts";

// Base project directory (restricts AI to this folder)
const PROJECT_ROOT = process.cwd();

const RESTRICTED_FILES = [".env", "package.json", "pnpm-lock.yaml", ".gitignore"];
const RESTRICTED_DIRS = [".git", "node_modules", ".gemini", "brain"];
const LARGE_DIRECTORY_ENTRY_LIMIT = 40;
const MAX_LIST_DEPTH = 4;
const HEAVY_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "target",
  "coverage",
  ".cache",
]);

function isRestricted(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  const isFileRestricted = RESTRICTED_FILES.some((f) => normalized.endsWith(f.toLowerCase()));
  const isDirRestricted = RESTRICTED_DIRS.some((d) => 
    normalized.startsWith(d.toLowerCase() + "/") || 
    normalized === d.toLowerCase() ||
    normalized.includes("/" + d.toLowerCase() + "/")
  );
  return isFileRestricted || isDirRestricted;
}

function toProjectRelativePath(fullPath: string): string {
  const relative = path.relative(PROJECT_ROOT, fullPath);
  return relative ? relative.replace(/\\/g, "/") : ".";
}

function isHeavyDirectoryName(name: string): boolean {
  return HEAVY_DIRECTORY_NAMES.has(name.toLowerCase());
}

function getDirectoryEntries(dir: string): fs.Dirent[] {
  return fs.readdirSync(dir, { withFileTypes: true });
}

function isOversizedDirectory(dir: string): boolean {
  try {
    return getDirectoryEntries(dir).length > LARGE_DIRECTORY_ENTRY_LIMIT;
  } catch {
    return false;
  }
}

function isInsideHeavyDirectory(fullPath: string): boolean {
  let current = path.resolve(fullPath);

  while (current.startsWith(PROJECT_ROOT)) {
    if (current !== PROJECT_ROOT) {
      const name = path.basename(current);
      if (isHeavyDirectoryName(name) || isOversizedDirectory(current)) {
        return true;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return false;
}

// Helper: recursively read file structure without expanding heavy directories
function listFilesRecursive(dir: string, depth = 0): any[] {
  const entries = getDirectoryEntries(dir);

  return entries.map((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relativePath = toProjectRelativePath(fullPath);

    if (entry.isDirectory()) {
      const childEntries = getDirectoryEntries(fullPath);

      if (isHeavyDirectoryName(entry.name)) {
        return {
          type: "directory",
          name: entry.name,
          path: relativePath,
          summarized: true,
          reason: "common dependency/cache/build directory",
          entryCount: childEntries.length,
        };
      }

      if (childEntries.length > LARGE_DIRECTORY_ENTRY_LIMIT) {
        return {
          type: "directory",
          name: entry.name,
          path: relativePath,
          summarized: true,
          reason: "directory is too large to expand safely",
          entryCount: childEntries.length,
        };
      }

      if (depth >= MAX_LIST_DEPTH) {
        return {
          type: "directory",
          name: entry.name,
          path: relativePath,
          summarized: true,
          reason: "max listing depth reached",
          entryCount: childEntries.length,
        };
      }

      return {
        type: "directory",
        name: entry.name,
        path: relativePath,
        children: listFilesRecursive(fullPath, depth + 1),
      };
    }

    return {
      type: "file",
      name: entry.name,
      path: relativePath,
    };
  });
}

export const fileTool = {
  read: (relativePath: string): string => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (!fs.existsSync(fullPath)) return "File does not exist";
    if (isInsideHeavyDirectory(fullPath))
      throw new Error("Access denied: file is inside a large dependency/cache/build directory");
    return fs.readFileSync(fullPath, "utf-8");
  },

  write: (relativePath: string, content: string) => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (isRestricted(relativePath))
      throw new Error("Access denied: restricted file");
    
    undoManager.createBackup(fullPath);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    return `Written to ${relativePath}`;
  },

  replace: (relativePath: string, find: string, replaceWith: string, replaceAll = false, expectedCount?: number) => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (isRestricted(relativePath))
      throw new Error("Access denied: restricted file");
    if (!fs.existsSync(fullPath))
      throw new Error("File does not exist");
    if (typeof find !== "string" || find.length === 0)
      throw new Error('The "find" value must be a non-empty string');

    const currentContent = fs.readFileSync(fullPath, "utf-8");
    const matchCount = currentContent.split(find).length - 1;

    if (matchCount === 0)
      throw new Error("Target text not found");
    if (typeof expectedCount === "number" && matchCount !== expectedCount)
      throw new Error(`Expected ${expectedCount} match(es) but found ${matchCount}`);

    const nextContent = replaceAll
      ? currentContent.split(find).join(replaceWith)
      : currentContent.replace(find, replaceWith);

    undoManager.createBackup(fullPath);
    fs.writeFileSync(fullPath, nextContent, "utf-8");

    const replacedCount = replaceAll ? matchCount : 1;
    return `Replaced ${replacedCount} occurrence(s) in ${relativePath}`;
  },

  mkdir: (relativePath: string) => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    fs.mkdirSync(fullPath, { recursive: true });
    return `Directory created: ${relativePath}`;
  },

  rename: (oldPath: string, newPath: string) => {
    const oldFullPath = path.join(PROJECT_ROOT, oldPath);
    const newFullPath = path.join(PROJECT_ROOT, newPath);
    if (
      !oldFullPath.startsWith(PROJECT_ROOT) ||
      !newFullPath.startsWith(PROJECT_ROOT)
    ) {
      throw new Error("Access denied: outside project folder");
    }
    if (!fs.existsSync(oldFullPath)) throw new Error("File does not exist");
    
    undoManager.createBackup(oldFullPath);
    undoManager.createBackup(newFullPath);

    fs.renameSync(oldFullPath, newFullPath);
    return `Renamed ${oldPath} to ${newPath}`;
  },

  delete: (relativePath: string) => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (isRestricted(relativePath))
      throw new Error("Access denied: restricted file");
    if (!fs.existsSync(fullPath))
      throw new Error("File does not exist");

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory())
      throw new Error("Delete only supports files. Use a dedicated directory delete flow if needed.");

    undoManager.createBackup(fullPath);
    fs.unlinkSync(fullPath);
    return `Deleted file: ${relativePath}`;
  },

  list: (relativePath = ".") => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (!fs.existsSync(fullPath)) throw new Error("Directory does not exist");
    if (!fs.statSync(fullPath).isDirectory())
      throw new Error("Path is not a directory");

    const rootEntries = getDirectoryEntries(fullPath);
    if (relativePath === "." && rootEntries.length > LARGE_DIRECTORY_ENTRY_LIMIT) {
      return {
        type: "directory",
        name: ".",
        path: ".",
        summarized: true,
        reason: "root directory is too large to expand fully",
        entryCount: rootEntries.length,
        children: rootEntries.map((entry) => {
          const childPath = path.join(fullPath, entry.name);
          if (!entry.isDirectory()) {
            return {
              type: "file",
              name: entry.name,
              path: toProjectRelativePath(childPath),
            };
          }

          const childEntries = getDirectoryEntries(childPath);
          const summarized =
            isHeavyDirectoryName(entry.name) || childEntries.length > LARGE_DIRECTORY_ENTRY_LIMIT;

          return {
            type: "directory",
            name: entry.name,
            path: toProjectRelativePath(childPath),
            summarized,
            ...(summarized
              ? {
                  reason: isHeavyDirectoryName(entry.name)
                    ? "common dependency/cache/build directory"
                    : "directory is too large to expand safely",
                  entryCount: childEntries.length,
                }
              : { children: listFilesRecursive(childPath, 1) }),
          };
        }),
      };
    }

    return listFilesRecursive(fullPath);
  },
};
