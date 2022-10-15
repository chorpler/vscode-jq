import { exec, ExecOptions, PromiseWithChild } from "child_process";
import { promisify } from "util";
import { WorkspaceConfiguration } from "vscode";
import { window } from "vscode";
import { workspace } from "vscode";
import { Logger, Debug } from "./logger";

const wrappedExec = promisify(exec);

const wrappedSpawn = async (cmd:string, options?:ExecOptions) => {

  let res = await wrappedExec(cmd, options);
  return res;
}

const DEFAULT_FILE = "sample.json";

export const DEFAULT_FILTER = ".";

export async function spawnJqUnsaved(
  userFilter: string = DEFAULT_FILTER,
  jsonData: string = "",
  config: WorkspaceConfiguration
) {
  // VSCode extensions currently do not support variable resolution in settings
  // https://github.com/microsoft/vscode/issues/2809
  // to work around it, we use well-defined variables starting with $$ that we replace here
  const { shell = '/bin/bash', customRawDataCommand = `jq '$$user_filter' <(echo -e $$json_data)` } = config;
  // if(!customCommand.contains('<$$json_data')){}
  const parsedCommand = customRawDataCommand
    .replace("$$user_filter", userFilter)
    .replace("$$json_data", jsonData);
  Debug.appendLine(`Command will be:\n` + shell + '\n' + parsedCommand);
  const { stdout } = await wrappedSpawn(parsedCommand, { shell: shell });
  return String(stdout);
}

export async function spawnJq(
  userFilter: string = DEFAULT_FILTER,
  filePath: string = DEFAULT_FILE,
  config: WorkspaceConfiguration
) {
  // VSCode extensions currently do not support variable resolution in settings
  // https://github.com/microsoft/vscode/issues/2809
  // to work around it, we use well-defined variables starting with $$ that we replace here

  const { customCommand = `jq '$$user_filter' $$file_path` } = config;
  const parsedCommand = customCommand
    .replace("$$user_filter", userFilter)
    .replace("$$file_path", filePath);
  const { stdout } = await wrappedSpawn(parsedCommand);
  return String(stdout);
}

export function stringifyCommand(command: string = "") {
  return `${command.slice(0, 8)}...`;
}
