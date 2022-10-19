import {
  commands,
  ExtensionContext,
  QuickPickItem,
  Uri,
  workspace,
} from "vscode";
import { Logger, Debug } from './logger';
import { showPreview } from "./commands/showPreview";
import { tabNext } from "./commands/showPreview";
import { JQProvider } from "./JQProvider";

export function activate({ subscriptions }: ExtensionContext) {
  const queries = new WeakMap<Uri, string>();
  const histories = new WeakMap<Uri, QuickPickItem[]>();
  Debug.appendLine("activate(): histories loaded");
  const strHist = JSON.stringify(histories);
  Debug.appendLine("activate(): histories:\n" + strHist);

  // register a content provider for the jq-scheme
  const myScheme = "jq";
  const myProvider = new JQProvider();
  subscriptions.push(
    workspace.registerTextDocumentContentProvider(myScheme, myProvider)
  );

  // register a command that opens a jq-document
  subscriptions.push(
    commands.registerCommand("jq.showPreview", showPreview(queries, histories)),
    commands.registerCommand("jq.tabNext", tabNext(queries, histories)),
  );

  workspace.onDidSaveTextDocument((document) => {
    const config = workspace.getConfiguration("jq");
    const { queryOnSave = false, outputNewDocument = true } = config;
    if(queryOnSave) {
        // only execute command on known documents
        if (!queries.has(document.uri)) return;
        commands.executeCommand("jq.showPreview", document.uri);
    }
  });
  workspace.onDidCloseTextDocument((document) => {
    queries.delete(document.uri);
    // histories.delete(document.uri);
  });
}
