import * as vscode from "vscode";
import * as fs from "fs";

// Test hook: when RESTIFY_TEST_STUB_FILE points at a JSON file like
// {"open": "/abs/path"} or {"save": "/abs/path"}, the matching dialog call
// returns that path instead of opening a native OS dialog. The stub file is
// consumed (deleted) after use, so each e2e test writes it before the click.
const stubFile = process.env.RESTIFY_TEST_STUB_FILE || "";

function readStub(): { open?: string; save?: string } {
  try {
    return JSON.parse(fs.readFileSync(stubFile, "utf8"));
  } catch {
    return {};
  }
}

function consume(path: string): boolean {
  try {
    fs.unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export async function showOpenDialog(
  options: vscode.OpenDialogOptions,
): Promise<vscode.Uri[] | undefined> {
  if (stubFile && fs.existsSync(stubFile)) {
    const stub = readStub();
    if (stub.open) {
      consume(stubFile);
      return [vscode.Uri.file(stub.open)];
    }
  }
  return vscode.window.showOpenDialog(options);
}

export async function showSaveDialog(
  options: vscode.SaveDialogOptions,
): Promise<vscode.Uri | undefined> {
  if (stubFile && fs.existsSync(stubFile)) {
    const stub = readStub();
    if (stub.save) {
      consume(stubFile);
      return vscode.Uri.file(stub.save);
    }
  }
  return vscode.window.showSaveDialog(options);
}
