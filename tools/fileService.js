"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileTool = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
// Base project directory (restricts AI to this folder)
var PROJECT_ROOT = process.cwd();
var RESTRICTED_FILES = [".env", "package.json"];
function isRestricted(filePath) {
    return RESTRICTED_FILES.some(function (f) { return filePath.endsWith(f); });
}
// Helper: recursively read file structure
function listFilesRecursive(dir, baseDir) {
    if (baseDir === void 0) { baseDir = dir; }
    return fs_1.default.readdirSync(dir, { withFileTypes: true }).map(function (entry) {
        var fullPath = path_1.default.join(dir, entry.name);
        var relativePath = path_1.default.relative(baseDir, fullPath);
        if (entry.isDirectory()) {
            return {
                type: "directory",
                name: entry.name,
                path: relativePath,
                children: listFilesRecursive(fullPath, baseDir),
            };
        }
        else {
            return {
                type: "file",
                name: entry.name,
                path: relativePath,
            };
        }
    });
}
exports.fileTool = {
    read: function (relativePath) {
        var fullPath = path_1.default.join(PROJECT_ROOT, relativePath);
        if (!fullPath.startsWith(PROJECT_ROOT))
            throw new Error("Access denied: outside project folder");
        if (!fs_1.default.existsSync(fullPath))
            return "File does not exist";
        return fs_1.default.readFileSync(fullPath, "utf-8");
    },
    write: function (relativePath, content) {
        var fullPath = path_1.default.join(PROJECT_ROOT, relativePath);
        if (!fullPath.startsWith(PROJECT_ROOT))
            throw new Error("Access denied: outside project folder");
        if (isRestricted(relativePath))
            throw new Error("Access denied: restricted file");
        fs_1.default.mkdirSync(path_1.default.dirname(fullPath), { recursive: true });
        fs_1.default.writeFileSync(fullPath, content, "utf-8");
        return "Written to ".concat(relativePath);
    },
    mkdir: function (relativePath) {
        var fullPath = path_1.default.join(PROJECT_ROOT, relativePath);
        if (!fullPath.startsWith(PROJECT_ROOT))
            throw new Error("Access denied: outside project folder");
        fs_1.default.mkdirSync(fullPath, { recursive: true });
        return "Directory created: ".concat(relativePath);
    },
    rename: function (oldPath, newPath) {
        var oldFullPath = path_1.default.join(PROJECT_ROOT, oldPath);
        var newFullPath = path_1.default.join(PROJECT_ROOT, newPath);
        if (!oldFullPath.startsWith(PROJECT_ROOT) ||
            !newFullPath.startsWith(PROJECT_ROOT)) {
            throw new Error("Access denied: outside project folder");
        }
        if (!fs_1.default.existsSync(oldFullPath))
            throw new Error("File does not exist");
        fs_1.default.renameSync(oldFullPath, newFullPath);
        return "Renamed ".concat(oldPath, " to ").concat(newPath);
    },
    list: function (relativePath) {
        if (relativePath === void 0) { relativePath = "."; }
        var fullPath = path_1.default.join(PROJECT_ROOT, relativePath);
        if (!fullPath.startsWith(PROJECT_ROOT))
            throw new Error("Access denied: outside project folder");
        if (!fs_1.default.existsSync(fullPath))
            throw new Error("Directory does not exist");
        if (!fs_1.default.statSync(fullPath).isDirectory())
            throw new Error("Path is not a directory");
        return listFilesRecursive(fullPath, PROJECT_ROOT);
    },
};
