import fs from "fs";
import path from "path";
import { undoManager } from "../core/UndoManager.ts";

// Base project directory (restricts AI to this folder)
const PROJECT_ROOT = process.cwd();

const RESTRICTED_FILES = [".env", "package.json", "pnpm-lock.yaml", ".gitignore"];
const RESTRICTED_DIRS = [".git", "node_modules", ".gemini", "brain"];

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

// Helper: recursively read file structure
function listFilesRecursive(dir: string, baseDir = dir): any {
  return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      return {
        type: "directory",
        name: entry.name,
        path: relativePath,
        children: listFilesRecursive(fullPath, baseDir),
      };
    } else {
      return {
        type: "file",
        name: entry.name,
        path: relativePath,
      };
    }
  });
}

export const fileTool = {
  read: (relativePath: string): string => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (!fs.existsSync(fullPath)) return "File does not exist";
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

  list: (relativePath = ".") => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT))
      throw new Error("Access denied: outside project folder");
    if (!fs.existsSync(fullPath)) throw new Error("Directory does not exist");
    if (!fs.statSync(fullPath).isDirectory())
      throw new Error("Path is not a directory");
    return listFilesRecursive(fullPath, PROJECT_ROOT);
  },
};
