import * as vscode from "vscode";

export const Logger = vscode.window.createOutputChannel("jq");
export const Debug = vscode.window.createOutputChannel("jq debug");

export default Logger;
