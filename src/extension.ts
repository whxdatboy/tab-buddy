import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { BranchState } from "./model";
import { loadAllTabs, saveAllTabs } from "./storage";
import { getGitAPI, getGitBranch } from "./git-info";

let memoryStore: Record<string, BranchState> = {};
let dirty = false;
const SAVE_DELAY = 300;
let saveTimeout: NodeJS.Timeout | undefined;

function scheduleSave(workspaceRoot: string) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  dirty = true;
  saveTimeout = setTimeout(() => {
    saveAllTabs(workspaceRoot, memoryStore);
    dirty = false;
  }, SAVE_DELAY);
}

function getOpenFilePaths(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input && (tab.input as any).uri?.scheme === "file")
    .map((tab) => ((tab.input as any).uri as vscode.Uri).fsPath);
}

function recordCurrentState(branch: string, workspaceRoot: string) {
  const files = getOpenFilePaths();
  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  memoryStore[branch] = { files, active };
  scheduleSave(workspaceRoot);
}

async function closeTabsNotInList(savedFiles: string[]) {
  const openTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);

  for (const tab of openTabs) {
    const uri = (tab.input as any)?.uri as vscode.Uri;
    if (!uri) {
      continue;
    }

    const fsPath = uri.fsPath;
    if (!savedFiles.includes(fsPath)) {
      try {
        await vscode.window.tabGroups.close(tab);
      } catch (err) {
        console.warn(`Не удалось закрыть вкладку: ${fsPath}`, err);
      }
    }
  }
}

async function openFiles(files: string[], activeFile?: string) {
  const docs = await Promise.allSettled(
    files.map((file) => vscode.workspace.openTextDocument(file))
  );

  for (const [i, result] of docs.entries()) {
    if (result.status === "fulfilled") {
      const doc = result.value;
      if (files[i] !== activeFile) {
        vscode.window.showTextDocument(doc, {
          preview: false,
          preserveFocus: true,
        });
      }
    }
  }

  // Активируем последним
  if (activeFile) {
    try {
      const doc = await vscode.workspace.openTextDocument(activeFile);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: false,
      });
    } catch (err) {
      console.warn(`Не удалось активировать ${activeFile}`, err);
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  memoryStore = loadAllTabs(workspaceRoot);

  const gitAPI = getGitAPI();
  if (!gitAPI) {
    vscode.window.showErrorMessage("Git API не найдена");
    return;
  }

  const trackGit = (repo: any) => {
    let lastBranch = repo.state.HEAD?.name;

    repo.state.onDidChange(() => {
      const currentBranch = repo.state.HEAD?.name;
      if (!currentBranch || currentBranch === lastBranch) {
        return;
      }

      // Сохраняем состояние старой ветки
      if (lastBranch) {
        recordCurrentState(lastBranch, workspaceRoot);
      }

      // Восстанавливаем вкладки новой ветки
      const state = memoryStore[currentBranch];
      if (state) {
        closeTabsNotInList(state.files).then(() =>
          openFiles(state.files, state.active)
        );
      }

      lastBranch = currentBranch;
    });
  };

  if (gitAPI.state === "initialized") {
    gitAPI.repositories.forEach(trackGit);
  } else {
    gitAPI.onDidChangeState((e: any) => {
      if (e === "initialized") {
        gitAPI.repositories.forEach(trackGit);
      }
    });
  }

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      const branch = getGitBranch();
      if (branch) {
        recordCurrentState(branch, workspaceRoot);
      }
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      const branch = getGitBranch();
      if (branch) {
        recordCurrentState(branch, workspaceRoot);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      const branch = getGitBranch();
      if (branch) {
        recordCurrentState(branch, workspaceRoot);
      }
    })
  );
}

export function deactivate() {}
