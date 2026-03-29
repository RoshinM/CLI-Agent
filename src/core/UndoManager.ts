import fs from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), ".backups");
const MAX_BACKUP_FILES = 50;
const MAX_BACKUP_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class UndoManager {
  constructor() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    this.cleanupBackups();
  }

  private stack: { path: string, backupPath: string }[] = [];

  createBackup(filePath: string) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return; // Don't backup if it doesn't exist (new file)

    const backupFileName = `backup_${Date.now()}_${path.basename(filePath)}`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);
    
    fs.copyFileSync(fullPath, backupPath);
    this.stack.push({ path: fullPath, backupPath });
    this.cleanupBackups();
  }

  undo(): string {
    const last = this.stack.pop();
    if (!last) return "No actions to undo.";

    fs.copyFileSync(last.backupPath, last.path);
    fs.unlinkSync(last.backupPath);
    return `Undone changes to ${path.relative(process.cwd(), last.path)}`;
  }

  private cleanupBackups() {
    if (!fs.existsSync(BACKUP_DIR)) {
      return;
    }

    const activeBackupPaths = new Set(this.stack.map((item) => item.backupPath));
    const now = Date.now();
    const files = fs.readdirSync(BACKUP_DIR)
      .map((name) => {
        const fullPath = path.join(BACKUP_DIR, name);
        const stats = fs.statSync(fullPath);
        return { name, fullPath, stats };
      })
      .filter((entry) => entry.stats.isFile())
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

    for (const file of files) {
      const isExpired = now - file.stats.mtimeMs > MAX_BACKUP_AGE_MS;
      if (isExpired && !activeBackupPaths.has(file.fullPath)) {
        fs.unlinkSync(file.fullPath);
      }
    }

    const remainingFiles = fs.readdirSync(BACKUP_DIR)
      .map((name) => {
        const fullPath = path.join(BACKUP_DIR, name);
        const stats = fs.statSync(fullPath);
        return { fullPath, stats };
      })
      .filter((entry) => entry.stats.isFile())
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

    for (const file of remainingFiles.slice(MAX_BACKUP_FILES)) {
      if (!activeBackupPaths.has(file.fullPath)) {
        fs.unlinkSync(file.fullPath);
      }
    }
  }
}

export const undoManager = new UndoManager();
