// Minimal Obsidian API typings for local build only.
// These are intentionally narrow; adjust as needed.

declare module 'obsidian' {
  export interface App {
    vault: Vault;
    workspace: Workspace;
  }

  export interface Workspace {
    activeEditor?: { editor: Editor };
  }

  export interface Editor {
    replaceSelection(text: string): void;
  }

  export interface Vault {
    getAbstractFileByPath(path: string): any;
    create(path: string, contents: string): Promise<any>;
    read(file: TFile): Promise<string>;
    modify(file: TFile, contents: string): Promise<void>;
    append?(path: string, contents: string): Promise<void>;
  }

  export type TFile = any;

  export class Plugin {
    app: App;
    loadData(): Promise<any>;
    saveData(data: any): Promise<void>;
    addCommand(cmd: any): void;
    addSettingTab(tab: any): void;
  }

  export class Notice {
    constructor(message: string, timeout?: number);
  }

  export function requestUrl(opts: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number; }): Promise<{ text: string }>;

  export interface ObsidianHTMLElement extends HTMLElement {
    empty(): void;
    createEl(tagName: string, attrs?: any): HTMLElement;
  }

  export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: ObsidianHTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
    hide(): void;
  }

  export class Setting {
    constructor(containerEl: any);
    setName(name: string): Setting;
    setDesc(desc: string): Setting;
    addText(cb: (text: any) => any): Setting;
    addToggle(cb: (toggle: any) => any): Setting;
    addButton(cb: (button: any) => any): Setting;
  }
}