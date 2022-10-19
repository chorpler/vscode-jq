import * as vscode from "vscode";

const mockDebug = {
  append: (val?:string) => {},
  appendLine: (val?:string) => {},
};

const config = vscode.workspace.getConfiguration("jq");
const { debugOutput } = config;

export const Debug = debugOutput === true ? vscode.window.createOutputChannel("jq debug") : mockDebug;
export const Logger = vscode.window.createOutputChannel("jq");

export default Logger;
