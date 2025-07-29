import * as fs from "fs";
import * as path from "path";
import { BranchState } from "./model";

export function loadAllTabs(
  workspaceRoot: string
): Record<string, BranchState> {
  try {
    const filePath = path.join(workspaceRoot, ".vscode", "branch-tabs.json");
    const json = fs.readFileSync(filePath, "utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function saveAllTabs(
  workspaceRoot: string,
  data: Record<string, BranchState>
) {
  try {
    const folderPath = path.join(workspaceRoot, ".vscode");
    const filePath = path.join(folderPath, "branch-tabs.json");
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Ошибка при сохранении вкладок:", err);
  }
}
