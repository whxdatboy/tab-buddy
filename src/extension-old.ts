import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import cp from "child_process";

const STORAGE_FILE = path.join(
  vscode.workspace.workspaceFolders?.[0].uri.fsPath || "",
  ".vscode",
  "branch-tabs.json"
);

let lastBranch: string | undefined;

/** --- Работа с хранилищем --- */

async function loadStorage(): Promise<Record<string, string[]>> {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveStorage(data: Record<string, string[]>): Promise<void> {
  const folder = path.dirname(STORAGE_FILE);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function saveTabsForBranch(
  branch: string,
  files: string[]
): Promise<void> {
  const data = await loadStorage();
  data[branch] = files;
  await saveStorage(data);
}

async function loadTabsForBranch(branch: string): Promise<string[]> {
  const data = await loadStorage();
  return data[branch] || [];
}

/** --- Git utils --- */

function isGitRepository(): boolean {
  try {
    const res = cp
      .execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" })
      .toString()
      .trim();
    return res === "true";
  } catch {
    return false;
  }
}

function getGitBranch(): string | undefined {
  const cwd = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!cwd) {
    return undefined;
  }

  try {
    const res = cp.execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      stdio: "pipe",
    });
    return res.toString().trim();
  } catch {
    return undefined;
  }
}

/** --- Работа с вкладками --- */

function getOpenFilePaths(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input && (tab.input as any).uri?.scheme === "file")
    .map((tab) => ((tab.input as any).uri as vscode.Uri).fsPath);
}

async function closeTabsNotInList(allowedFiles: string[]): Promise<void> {
  const openTabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input && (tab.input as any).uri?.scheme === "file");

  for (const tab of openTabs) {
    const filePath = ((tab.input as any).uri as vscode.Uri).fsPath;

    if (!allowedFiles.includes(filePath)) {
      try {
        await vscode.window.tabGroups.close(tab);
      } catch (e) {
        console.warn(`Не удалось закрыть вкладку: ${filePath}`, e);
      }
    }
  }
}

async function openFiles(files: string[]): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  for (const file of files) {
    const uri = vscode.Uri.file(file);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: true,
      });
    } catch (err) {
      console.warn(`Не удалось открыть файл: ${file}`, err);
    }
  }
}

/** --- Основная логика восстановления --- */

async function restoreTabs(branch: string) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  const configPath = path.join(
    workspaceFolders[0].uri.fsPath,
    ".vscode/branch-tabs.json"
  );
  if (!fs.existsSync(configPath)) {
    return;
  }

  const content = fs.readFileSync(configPath, "utf8");
  const data = JSON.parse(content);
  const branchData = data[branch];

  if (!branchData || !Array.isArray(branchData.files)) {
    return;
  }

  const { files, active } = branchData;

  // Закрываем текущие редакторы (можно опционально сделать это настраиваемым)
  for (const editor of vscode.window.visibleTextEditors) {
    await vscode.window.showTextDocument(editor.document, { preview: false });
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }

  let activeDoc: vscode.TextDocument | undefined;

  for (const file of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: true,
      });

      if (file === active) {
        activeDoc = doc;
      }
    } catch (err) {
      console.warn(`Не удалось открыть файл: ${file}`, err);
    }
  }

  if (activeDoc) {
    await vscode.window.showTextDocument(activeDoc, {
      preview: false,
      preserveFocus: false,
    });
  }
}

/** --- Сохранение текущих вкладок --- */

function saveCurrentTabs() {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const branch = getGitBranch() ?? "__no_git__";
  const savePath = path.join(workspaceRoot, ".vscode", "branch-tabs.json");

  const openFiles = getOpenFilePaths();
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

  let data: Record<string, { files: string[]; active?: string }> = {};
  if (fs.existsSync(savePath)) {
    data = JSON.parse(fs.readFileSync(savePath, "utf8"));
  }

  data[branch] = {
    files: openFiles,
    active: activeFile,
  };

  fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf8");
}

/** --- Активация плагина --- */

export function activate(context: vscode.ExtensionContext) {
  const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
  const git = gitExtension?.getAPI(1);
  const repo = git?.repositories[0];

  if (!repo) {
    vscode.window.showWarningMessage("Git репозиторий не найден.");
    return;
  }

  lastBranch = repo.state.HEAD?.name;

  // Автоматическое восстановление при смене ветки
  repo.state.onDidChange(() => {
    const newBranch = repo.state.HEAD?.name;
    if (newBranch && newBranch !== lastBranch) {
      lastBranch = newBranch;
      restoreTabs(newBranch);
    }
  });

  // Команда сохранения вкладок вручную
  const saveCommand = vscode.commands.registerCommand(
    "branchTabRestore.saveTabs",
    async () => {
      try {
        await saveCurrentTabs();
        vscode.window.showInformationMessage(
          `Вкладки сохранены для ветки "${lastBranch}"`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Ошибка при сохранении вкладок: ${err}`);
      }
    }
  );

  // Команда восстановления вкладок вручную
  const restoreCommand = vscode.commands.registerCommand(
    "branchTabRestore.restoreTabs",
    async () => {
      const branch = getGitBranch();
      if (!branch) {
        vscode.window.showWarningMessage(
          "Не удалось определить текущую ветку Git."
        );
        return;
      }
      await restoreTabs(branch);
    }
  );

  context.subscriptions.push(saveCommand, restoreCommand);

  // Автосохранение при изменении открытых вкладок
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => saveCurrentTabs()),
    vscode.workspace.onDidCloseTextDocument(() => saveCurrentTabs()),
    vscode.window.onDidChangeActiveTextEditor(() => saveCurrentTabs())
  );

  // Восстановление вкладок при активации плагина
  if (lastBranch) {
    restoreTabs(lastBranch);
  }
}
