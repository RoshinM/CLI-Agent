import fs from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), ".backups");

export class UndoManager {
  constructor() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  private stack: { path: string, backupPath: string }[] = [];

  createBackup(filePath: string) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return; // Don't backup if it doesn't exist (new file)

    const backupFileName = `backup_${Date.now()}_${path.basename(filePath)}`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);
    
    fs.copyFileSync(fullPath, backupPath);
    this.stack.push({ path: fullPath, backupPath });
  }

  undo(): string {
    const last = this.stack.pop();
    if (!last) return "No actions to undo.";

    fs.copyFileSync(last.backupPath, last.path);
    fs.unlinkSync(last.backupPath);
    return `Undone changes to ${path.relative(process.cwd(), last.path)}`;
  }
}

export const undoManager = new UndoManager();
