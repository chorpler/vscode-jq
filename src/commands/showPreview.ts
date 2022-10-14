import { QuickPickItem, QuickPickItemButtonEvent             } from "vscode";
import { QuickInputButton          } from "vscode";
import { QuickInputButtons         } from "vscode";
import { ExtensionContext          } from "vscode";
import { ThemeIcon                 } from "vscode";
import { ThemeColor                } from "vscode";
import { Uri                       } from "vscode";
import { ViewColumn                } from "vscode";
import { window                    } from "vscode";
import { workspace                 } from "vscode";
import * as vscode from "vscode";
import { spawnJq, spawnJqUnsaved, stringifyCommand } from "../jq" ;
import { Logger, Debug             } from '../logger';
import { renderOutput, renderError, RenderOutputType } from '../renderer';

const createCloseButton = function(val:string):QuickInputButton {
  let btn:QuickInputButton = {
    iconPath: new ThemeIcon("search-remove", new ThemeColor('input.foreground')),
    tooltip: `Clear history item '${val}'`,
  };
  return btn;
};

const createLoadButton = function(val:string):QuickInputButton {
  let btn:QuickInputButton = {
    iconPath: new ThemeIcon("folder-opened", new ThemeColor('input.foreground')),
    tooltip: `Load item '${val}'`,
  };
  return btn;
};

const initialChoices = ["."];
const generateItems = (items:string[]=initialChoices):QuickPickItem[] => items.map((label:string) => ({ label: label, buttons: [createLoadButton(label), createCloseButton(label)]}));

// class MyButton implements QuickInputButton {
//   constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
// }

// const createResourceGroupButton = new MyButton({
//   dark: Uri.file(new ThemeIcon('close')),
//   light: Uri.file(context.asAbsolutePath('resources/light/add.svg')),
// }, 'Create Resource Group');

// let itemcon = window.createOutputChannel("ItemPicked");

async function pickFilter(uri: Uri, histories: WeakMap<Uri, QuickPickItem[]>) {
  try {
    Logger.appendLine("pickFilter() is currently running brah");
    return await new Promise<string>((resolve, reject) => {
      const input = window.createQuickPick<QuickPickItem>();
      input.placeholder = "Type a new command or select one from your history";
      input.items = histories.get(uri) ? generateItems(histories.get(uri)?.map(qpi => qpi.label)) :  generateItems();
      // input.items.forEach(item => {
      //   let btn = createCloseButton();
      //   item.buttons = [btn];
      // });
      // input.items[0].picked

      let label = "";
      input.onDidChangeValue((newText) => (label = newText));
      input.onDidTriggerItemButton((evt:QuickPickItemButtonEvent<QuickPickItem>) => {
        let btn = evt.button;
        let item = evt.item;
        let idx = item.buttons?.indexOf(btn);
        let itemlbl = evt && evt.item && evt.item.label ? evt.item.label : "unknown_item";
        if(idx === 0) {
          /* Is load button */
          Logger.appendLine("Load button clicked for item:" + itemlbl);
          input.value = item.label;
          // resolve(``);
        } else if(idx === 1) {
          /* Is close button */
          Logger.appendLine("Close button clicked for item: " + itemlbl);
          input.items = input.items.filter(item => item !== evt.item);
          const newHistory = [...input.items];
          histories.set(uri, newHistory);
          // resolve(`Deleted item '${itemlbl}'`);
        } else {
          Logger.appendLine("WARNING: Can't detect button type");
        }
      });

      input.onDidAccept(() => {
        // if the user selects a new command, add it to our histories map
        // if the history map is empty, for whatever reason, we fill it too
        const { selectedItems } = input;
        let strSel = JSON.stringify(selectedItems);
        Logger.appendLine(`Accepted:\n` + strSel);
        const newHistory = [...input.items];
        if (selectedItems.length < 1) newHistory.push({ label });
        histories.set(uri, newHistory);

        resolve(selectedItems[0]?.label ?? label);
        input.dispose();
      });
      input.show();
    });
  } finally {
    // we can probably reset history for this uri here if we absolutely do not want to keep it
  }
}

const showPreview = (
  queries: WeakMap<Uri, string>,
  histories: WeakMap<Uri, QuickPickItem[]>
) => async (uri: Uri) => {
  if (!window.activeTextEditor) return;
  
  const { document } = window.activeTextEditor;
  const { fileName, languageId, uri: documentUri } = document;
  
  const config = workspace.getConfiguration("jq");
  const { strictMode=false, queryOnSave=false, outputNewDocument=true, validLanguageIdentifiers = [] } = config;
  
  Logger.appendLine("showPreview() is running now");
  // strict mode requires our document languageId to be part of validLanguageIdentifiers
  // you can technically configurate this using fileAssociations, but there may be reasons for users to bypass this check
  // see https://github.com/ldd/vscode-jq/issues/17
  if (strictMode && languageId !== "json") return;

  let jqCommand: string | undefined;
  if (queries.has(uri)) {
    jqCommand = queries.get(uri);
  } else {
    // better QuickPick with history suggestion inspired by this issue: https://github.com/microsoft/vscode/issues/426
    jqCommand = await pickFilter(documentUri, histories);
    queries.set(documentUri, jqCommand);
  }

  // jqCommand could be undefined for a number of reasons, we exit early to avoid trouble
  if (jqCommand === undefined) return;

  let rawDataMode = false;
  // try {
    let isNew = window.activeTextEditor?.document?.isUntitled;
    let query;
    if(isNew) {
      Debug.appendLine(`Is fresh new unspoiled UNTITLED-n file!`);
      let jsonData = window.activeTextEditor.document.getText();
      // let strJsonData = jsonData;
      // let strJsonData = typeof jsonData !== 'string' ? JSON.stringify(jsonData) : jsonData;
      let strJsonData = JSON.stringify(jsonData);
      Debug.appendLine(`command will be:\n` + jqCommand);
      Debug.appendLine(`Sending json data:\n` + jsonData);
      Debug.appendLine(`Sending json string data:\n` + strJsonData);
      query = await spawnJqUnsaved(jqCommand, strJsonData, config);
    } else {
      Debug.appendLine(`Showing in output pane`);
      query = await spawnJq(jqCommand, fileName, config);
    }
    if(query) {
      if(outputNewDocument) {
        const name = stringifyCommand(jqCommand);
        const previewUri = Uri.parse(`jq:${name}.json`).with({ query });
        const doc = await workspace.openTextDocument(previewUri); // calls back into the provider
        await window.showTextDocument(doc, {
          preserveFocus: true,
          preview: true,
          viewColumn: ViewColumn.Beside,
        });
      } else {
        renderOutput(null)(query);
      }
    }
    // await workspace.fs.stat(uri);
      // window.showTextDocument(jsUri, { viewColumn: vscode.ViewColumn.Beside });
    // } catch {
      // window.showInformationMessage(`${jsUri.toString(true)} file does *not* exist`);
    // }

  // const query = await spawnJq(jqCommand, fileName, config);
  // if (query) {
  //   const name = stringifyCommand(jqCommand);
  //   const previewUri = Uri.parse(`jq:${name}.json`).with({ query });
  //   const doc = await workspace.openTextDocument(previewUri); // calls back into the provider
  //   await window.showTextDocument(doc, {
  //     preserveFocus: true,
  //     preview: true,
  //     viewColumn: ViewColumn.Beside,
  //   });
  // }
};

export default showPreview;
