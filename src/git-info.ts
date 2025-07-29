import * as vscode from "vscode";

export function getGitAPI() {
  const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
  return gitExtension?.getAPI(1);
}

export function getGitBranch(): string | undefined {
  const gitAPI = getGitAPI();
  return gitAPI?.repositories?.[0]?.state?.HEAD?.name;
}
