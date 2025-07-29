# TabBuddy

## Features

**TabBuddy** automatically saves and restores your open VS Code tabs for each Git branch in your project.
When you switch branches, the extension closes tabs that are no longer in the history for the new branch and reopens the files that were previously saved.

- Automatically saves the list of open files and the active tab when switching branches.
- Restores tabs and active file when returning to a previously used branch.
- Closes tabs that are not present in the current branch's file list to keep your workspace clean.
- Supports VS Code workspaces and the Git API.

> Easily switch between branches without losing your workflow context!

## Requirements

- Requires Git installed and an active repository in your workspace folder.
- Compatible with VS Code version 1.60 and above.
- Recommended to use with local projects or WSL with properly configured Git.

## Extension Settings

This extension currently has no user-configurable settings.

## Known Issues

- When using multi-repository workspaces, only the first repository's state is saved and restored.
- There might be a slight delay when restoring a large number of tabs, especially on slower disks.
- In rare cases, switching branches without saving might cause loss of the current tab list.

## Release Notes

### 1.0.0

- Initial release of TabBuddy.
- Automatic saving and restoring of tabs per Git branch.
- Management of active tab and closing of outdated tabs.

---

**Enjoy using TabBuddy!**
