import { fileTool } from "../tools/fileService.ts"

JSON.parse(
    `{ "tool": "file_tool", "action": "rename", "path": "current_file_path", "new_path": "new_file_path" }`
)
fileTool.rename("rename/story.txt", "rename/new_story.txt")