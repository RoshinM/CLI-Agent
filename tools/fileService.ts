import fs from 'fs';
import path from 'path';

// Base project directory (restricts AI to this folder)
const PROJECT_ROOT = process.cwd();

const RESTRICTED_FILES = [".env", "package.json"];

function isRestricted(filePath: string) {
  return RESTRICTED_FILES.some(f => filePath.endsWith(f));
}

export const fileTool = {
  read: (relativePath: string): string => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT)) throw new Error("Access denied: outside project folder");
    if (!fs.existsSync(fullPath)) return "File does not exist";
    return fs.readFileSync(fullPath, "utf-8");
  },

  write: (relativePath: string, content: string) => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT)) throw new Error("Access denied: outside project folder");
    if (isRestricted(relativePath)) throw new Error("Access denied: restricted file");
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    return `Written to ${relativePath}`;
  },

  mkdir: (relativePath: string) => {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    if (!fullPath.startsWith(PROJECT_ROOT)) throw new Error("Access denied: outside project folder");
    fs.mkdirSync(fullPath, { recursive: true });
    return `Directory created: ${relativePath}`;
  }
};
