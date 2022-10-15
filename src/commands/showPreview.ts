import * as vscode from 'vscode'                      ;
import { QuickPickItem            } from 'vscode'     ;
import { QuickPickItemKind        } from 'vscode'     ;
import { ConfigurationTarget      } from 'vscode'     ;
import { QuickPickItemButtonEvent } from 'vscode'     ;
import { WorkspaceConfiguration   } from 'vscode'     ;
import { QuickInputButton         } from 'vscode'     ;
import { QuickPick                } from 'vscode'     ;
import { QuickInputButtons        } from 'vscode'     ;
import { ExtensionContext         } from 'vscode'     ;
import { ThemeIcon                } from 'vscode'     ;
import { ThemeColor               } from 'vscode'     ;
import { Uri                      } from 'vscode'     ;
import { ViewColumn               } from 'vscode'     ;
import { Logger                   } from '../logger'  ;
import { Debug                    } from '../logger'  ;
import { RenderOutputType         } from '../renderer';
import { window                   } from 'vscode'     ;
import { workspace                } from 'vscode'     ;
import { spawnJq                  } from '../jq'      ;
import { spawnJqUnsaved           } from '../jq'      ;
import { stringifyCommand         } from '../jq'      ;
import { renderOutput             } from '../renderer';
import { renderError              } from '../renderer';


var config:WorkspaceConfiguration;
var input:QuickPick<QuickPickItem>;
var globals:QuickPickItem[];
var locals:QuickPickItem[];
var cfgGlobal:any;

const color1 = new ThemeColor('input.foreground');
const color2 = new ThemeColor('button.foreground');
const buttons:ButtonList = {
  filter: {
    on: { iconPath: new ThemeIcon("filter-filled", color2), tooltip: `Filter mode active`, },
    off: { iconPath: new ThemeIcon("filter", color2), tooltip: `Filter mode inactive`, },
  },
  newdoc: {
    on: { iconPath: new ThemeIcon("file-code", color2), tooltip: `Show results in new document`, },
    off: { iconPath: new ThemeIcon("terminal", color2), tooltip: `Show results in Output panel`, },
  },
};


const createCloseButton = function(val:string):QuickInputButton {
  let btn:QuickInputButton = {
    iconPath: new ThemeIcon("search-remove", color1),
    tooltip: `Clear history item '${val}'`,
  };
  return btn;
};

const createLoadButton = function(val:string):QuickInputButton {
  let btn:QuickInputButton = {
    iconPath: new ThemeIcon("folder-opened", color1),
    tooltip: `Load item '${val}'`,
  };
  return btn;
};

const createSaveButton = function(val:string):QuickInputButton {
  let btn:QuickInputButton = {
    iconPath: new ThemeIcon("save", color1),
    tooltip: `Save item '${val}'`,
  };
  return btn;
};

const createGlobalButton = function(val:string):QuickInputButton {
  let btn:QuickInputButton = {
    iconPath: new ThemeIcon("globe", color1),
    tooltip: `Globally save item '${val}'`,
  };
  return btn;
};

type QIB = QuickInputButton;
interface ButtonList {
  filter: { on: QIB, off: QIB};
  newdoc: { on: QIB, off: QIB};
}

const states = {
  filterMode: false,
  outputDocument: false,
};

const initialChoices:string[] = [];
const generateItems = (items:string[]=initialChoices):QuickPickItem[] => {
  let fItems = items.filter(lbl => lbl !== 'Document' && lbl !== 'Global');
  let newItems = fItems.map((label:string) => {
    let newItem:QuickPickItem = {
      label: label,
      buttons: [
        // createLoadButton(label),
        createGlobalButton(label),
        createSaveButton(label),
        createCloseButton(label),
      ],
      picked: false,
      alwaysShow:!states.filterMode,
    };
    return newItem;
  });
  let dsep:QuickPickItem = {
    label: "Document",
    kind: QuickPickItemKind.Separator,
  };
  let gsep:QuickPickItem = {
    label: "Global",
    kind: QuickPickItemKind.Separator,
  };
  let gLabels = (config.get("globalFormulas") as string[]);
  let globals:QuickPickItem[] = gLabels.map(label => {
    let newItem:QuickPickItem = {
      label: label,
      buttons: [
        // createLoadButton(label),
        // createGlobalButton(label),
        // createSaveButton(label),
        createCloseButton(label),
      ],
      picked: false,
      alwaysShow:!states.filterMode,
    };
    return newItem;
  });
  globals = globals.filter(item => {
    let lbl = item.label;
    return fItems.indexOf(lbl) === -1;
  });
  // newItems = [];
  if(fItems.length > 0) {
    // newItems = [dsep];
    newItems = [...newItems, gsep];
  }
  newItems = [...newItems, ...globals];
  return newItems;
};

// class MyButton implements QuickInputButton {
//   constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }  
// }

// const createResourceGroupButton = new MyButton({
//   dark: Uri.file(new ThemeIcon('close')),  
//   light: Uri.file(context.asAbsolutePath('resources/light/add.svg')),
// }, 'Create Resource Group');

// let itemcon = window.createOutputChannel("ItemPicked");
const setContext = (state: boolean) => {
  vscode.commands.executeCommand("setContext", "inJqPreview", state);
}  


async function pickFilter(uri: Uri, histories: WeakMap<Uri, QuickPickItem[]>) {
  try {
    Logger.appendLine("pickFilter() is currently running brah");
    return await new Promise<string>((resolve, reject) => {
      input = window.createQuickPick<QuickPickItem>();
      let outputNewDocument = states.outputDocument;
      let btndoc = outputNewDocument === true ? buttons.newdoc.on : buttons.newdoc.off;
      let btnfil = states.filterMode === true ? buttons.filter.on : buttons.filter.off;
      input.buttons = [
        btndoc,
        btnfil,
      ];
      input.placeholder = "Type a new command or select one from your history";
      input.items = histories.get(uri) ? generateItems(histories.get(uri)?.map(qpi => qpi.label)) :  generateItems();
      // input.items.forEach(item => {
      //   let btn = createCloseButton();
      //   item.buttons = [btn];
      // });
      // input.items[0].picked

      input.onDidHide(() => {
        setContext(false);
      });
      let label = "";
      input.onDidChangeValue((newText:string) => {
        label = newText;
      });
      input.onDidChangeActive((items:readonly QuickPickItem[]) => {
        let item:QuickPickItem = Array.isArray(items) && items.length > 0 ? items[0] : null;
        // Logger.appendLine("Active item changed");
        if(item != null) {
          let txt = item.label;
          Logger.appendLine("Active item now: " + txt);
        }
      });
      input.onDidChangeSelection((items:readonly QuickPickItem[]) => {
        let item:QuickPickItem = Array.isArray(items) && items.length > 0 ? items[0] : null;
        // Logger.appendLine("Selection changed");
        if(item != null) {
          let txt = item.label;
          Logger.appendLine("Selection is now: " + txt);
          // input.value = item.label;
        }
      });

      input.onDidTriggerItemButton((evt:QuickPickItemButtonEvent<QuickPickItem>) => {
        let btn = evt.button;
        let item = evt.item;
        let idx = item.buttons?.indexOf(btn);
        let itemlbl = evt && evt.item && evt.item.label ? evt.item.label : "unknown_item";
        if(idx === 0) {
          /* Is global save button */
          Logger.appendLine("GlobalSave button clicked for item:" + itemlbl);
          input.value = item.label;
          let cfgKey = "globalFormulas";
          let cfgJq = workspace.getConfiguration("jq");
          let cfg1 = cfgJq[cfgKey];
          cfgGlobal = {...cfg1};
          let cfg2 = cfgJq.savedDocumentFormulas;
          // let cfg2 = workspace.getConfiguration("jq.savedDocumentFormulas");
          let strCfg1 = JSON.stringify(cfg1);
          let strCfg2 = JSON.stringify(cfg2);
          Logger.appendLine("Global saved queries:\n" + strCfg1);
          Logger.appendLine("Document saved queries:\n" + strCfg2);
          cfgJq.update(cfgKey, globals, ConfigurationTarget.Global);
          // resolve(``);
        } else if(idx === 1) {
          /* Is save button */
          Logger.appendLine("Save button clicked for item: " + itemlbl);
          let cfgKey = "savedDocumentFormulas";
          let global = window.activeTextEditor?.document?.isUntitled;
          let wsCfg = workspace.getConfiguration("jq");
          if(global) {
            /* Unsaved document, save to global list */
            cfgKey = "globalFormulas";
            // let qs:string[] = wsCfg.get(cfgKey, []);
            let qs:string[] = wsCfg[cfgKey] || [];
            let queries = [...qs];
            let strQs = JSON.stringify(queries);
            Logger.appendLine(`Saved global queries:\n` + strQs);
            if(queries.indexOf(itemlbl) === -1) {
              queries.unshift(itemlbl);
            }
            strQs = JSON.stringify(queries);
            Logger.appendLine(`Updated global queries:\n` + strQs);
            workspace.getConfiguration("jq").update(cfgKey, queries, ConfigurationTarget.Global);
          } else {
            /* Existing document, save to it only */
            let qs:any = wsCfg.get(cfgKey, {});
            let queries = Object.assign({}, qs);
            let strQs = JSON.stringify(queries);
            Logger.appendLine(`Saved queries:\n` + strQs);
  
            let strHist = JSON.stringify(histories);
            Logger.appendLine(`Histories is:\n` + strHist);
            let docId = uri.fsPath;
            let docArray = queries && Array.isArray(queries[docId]) ? queries[docId] : [];
            if(docArray.indexOf(itemlbl) === -1) {
              docArray.unshift(itemlbl);
            }
            queries[docId] = docArray;
            strQs = JSON.stringify(queries);
            Logger.appendLine(`Updated queries:\n` + strQs);
            wsCfg.update(cfgKey, queries, ConfigurationTarget.Global);
          }

          // input.items = input.items.filter(item => item !== evt.item);
          // const newHistory = [...input.items];
          // histories.set(uri, newHistory);
          // resolve(`Deleted item '${itemlbl}'`);
        } else if(idx === 2) {
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

      input.onDidTriggerButton((evt:QuickInputButton) => {
        if(evt === buttons.filter.on || evt === buttons.filter.off) {
          let state = states.filterMode;
          let out = !state;
          Logger.appendLine("Filter button triggered, will be set to:" + out);
          if(out) {
            input.buttons = [ input.buttons[0], buttons.filter.on ];
          } else {
            input.buttons = [ input.buttons[0], buttons.filter.off ];
          }
          let labels = input.items.map(item => item.label);
          labels = labels.filter(lbl => lbl !== 'Document' && lbl !== 'Global');
          states.filterMode = out;
          input.items = generateItems(labels);
        } else if(evt === buttons.newdoc.on || evt === buttons.newdoc.off) {
          let state = states.outputDocument;
          let out = !state;
          let desc = out === true ? "document" : "output";
          Logger.appendLine("Output button triggered, output type is now:" + desc);
          if(out) {
            input.buttons = [ buttons.newdoc.on, input.buttons[1] ];
          } else {
            input.buttons = [ buttons.newdoc.off, input.buttons[1] ];
          }
          config.update("jq.outputNewDocument", out, ConfigurationTarget.Global);
          states.outputDocument = out;
        }
      });

      input.onDidAccept(() => {
        // if the user selects a new command, add it to our histories map
        // if the history map is empty, for whatever reason, we fill it too
        const { selectedItems } = input;
        let strSel = JSON.stringify(selectedItems);
        let val = input.value;
        if(val === "") {
          val = input.activeItems && input.activeItems.length > 0 ? input.activeItems[0].label : val;
        }
        Logger.appendLine(`Accepted, selected items:\n` + strSel);
        Logger.appendLine("Accepted with input:\n" + val);
        const tmpHistory = [...input.items];
        let newHistoryLabels = tmpHistory.map(item => item.label);
        if(selectedItems.length < 1) {
          newHistoryLabels.unshift(label);
        }
        if(newHistoryLabels.indexOf(val) === -1) {
          newHistoryLabels.unshift(val);
        }
        newHistoryLabels = newHistoryLabels.filter(lbl => lbl && typeof lbl === 'string' && lbl.trim())
        const newHistory = generateItems(newHistoryLabels);
        histories.set(uri, newHistory);
        let jqCmd = val;
        if(jqCmd === "") {
          Logger.appendLine("Empty JQ string, user canceled.");
          reject("No JQ command provided");
          input.dispose();
        }
        Logger.appendLine("Value accepted: " + jqCmd);
        // if(selectedItems[0]?.label !== input.value) {}
        // resolve(selectedItems[0]?.label ?? label);
        resolve(jqCmd);
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
  
  config = workspace.getConfiguration("jq");
  let cfgStr = JSON.stringify(config);
  Logger.appendLine("JQ config:\n" + cfgStr);
  const { strictMode=false, queryOnSave=false, outputNewDocument=false, validLanguageIdentifiers = [] } = config;
  states.outputDocument = outputNewDocument;
  Logger.appendLine("showPreview() is running now");

  setContext(true);
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

const tabNext = (
  queries: WeakMap<Uri, string>,
  histories: WeakMap<Uri, QuickPickItem[]>
) => async (uri: Uri) => {
  Logger.appendLine("Tab received!");
  if(input) {
    let active:QuickPickItem = Array.isArray(input.activeItems) && input.activeItems.length > 0 ? input.activeItems[0] : null;
    if(active !== null) {
      let activeLabel = active.label;
      if(input.value !== activeLabel) {
        input.value = activeLabel;
      }
    }
  }
};

export { showPreview, tabNext };

export default showPreview;
