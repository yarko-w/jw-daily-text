import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl, TFile } from 'obsidian';
import { DailyTextFetcher, DailyText } from './fetcher';

interface JWPluginSettings {
  targetPathTemplate: string;
  appendToFile: boolean;
  autoFetchDaily: boolean;
}

const DEFAULT_SETTINGS: JWPluginSettings = {
  targetPathTemplate: "Daily/JW Daily Text - {YYYY}-{MM}-{DD}.md",
  appendToFile: true,
  autoFetchDaily: false,
};

export default class JWDailyTextPlugin extends Plugin {
  settings!: JWPluginSettings;
  public midnightTimeoutId: number | null = null;
  public dailyIntervalId: number | null = null;
  private fetcher!: DailyTextFetcher;

  async onload() {
    console.log('Loading JW Daily Text plugin');
    await this.loadSettings();

    this.fetcher = new DailyTextFetcher();

    this.addCommand({
      id: 'jw-fetch-daily-text',
      name: 'Fetch JW Daily Text',
      callback: async () => {
        await this.fetchAndWriteDailyText();
      }
    });

    this.addCommand({
      id: 'jw-insert-daily-text-at-cursor',
      name: 'Insert JW Daily Text at Cursor',
      callback: async () => {
        const editor = this.app.workspace.activeEditor?.editor;
        if (!editor) {
          new Notice('No active editor found');
          return;
        }
        try {
          const dailyText = await this.fetchDailyText();
          const formatted = this.buildMarkdownBlock(new Date(), dailyText);
          editor.replaceSelection(formatted);
          new Notice('JW Daily Text inserted at cursor');
        } catch (error) {
          console.error('Error inserting daily text:', error);
          new Notice('Failed to insert JW Daily Text');
        }
      }
    });

    this.addSettingTab(new JWSettingTab(this.app, this));

    if (this.settings.autoFetchDaily) {
      this.scheduleDailyAutoFetch();
    }

    console.log('JW Daily Text plugin loaded');
  }

  onunload() {
    console.log('Unloading JW Daily Text plugin');
    if (this.midnightTimeoutId) {
      window.clearTimeout(this.midnightTimeoutId);
      this.midnightTimeoutId = null;
    }
    if (this.dailyIntervalId) {
      window.clearInterval(this.dailyIntervalId);
      this.dailyIntervalId = null;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private pad(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
  }

  private formatDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = this.pad(date.getMonth() + 1);
    const dd = this.pad(date.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }



  private formatPathTemplate(template: string, date: Date) {
    const YYYY = date.getFullYear().toString();
    const MM = this.pad(date.getMonth() + 1);
    const DD = this.pad(date.getDate());
    return template.replace(/{YYYY}/g, YYYY).replace(/{MM}/g, MM).replace(/{DD}/g, DD);
  }



  private buildMarkdownBlock(date: Date, parsed: { scripture: string; citation: string; commentary: string }) {
    const dateStr = date.toISOString().slice(0, 10);
    let md = `# Daily Text - ${dateStr}\n\n`;
    
    if (parsed.citation) {
      md += `>[!bible] ${parsed.citation}\n`;
    }
    if (parsed.scripture) {
      md += `${parsed.scripture}\n\n`;
    }
    if (parsed.commentary) {
      md += `${parsed.commentary}\n\n`;
    }
    md += `---\n\n`;
    return md;
  }

  private async writeToVault(path: string, content: string, append: boolean) {
    const vault = this.app.vault;
    try {
      const existing = vault.getAbstractFileByPath(path);
      if (!existing) {
        await vault.create(path, content);
      } else {
        if (append) {
          const current = await vault.read(existing as TFile);
          await vault.modify(existing as TFile, current + content);
        } else {
          await vault.modify(existing as TFile, content);
        }
      }
      new Notice(`JW Daily Text written to ${path}`);
    } catch (error) {
      console.error('Error writing to vault:', error);
      new Notice(`Error writing JW Daily Text to ${path}`);
    }
  }

  private async fetchDailyText(forDate?: Date): Promise<{ scripture: string; citation: string; commentary: string }> {
    const targetDate = forDate ?? new Date();
    const dateStr = this.formatDate(targetDate);
    const dailyText = await this.fetcher.fetchDailyTextForDate(dateStr);
    return {
      scripture: dailyText.scripture,
      citation: dailyText.citation,
      commentary: dailyText.commentary
    };
  }

  async fetchAndWriteDailyText(forDate?: Date) {
    const targetDate = forDate ?? new Date();

    new Notice('Fetching JW Daily Text...');
    console.log('Fetching JW Daily Text');

    try {
      const parsed = await this.fetchDailyText(targetDate);
      const md = this.buildMarkdownBlock(targetDate, parsed);

      const path = this.formatPathTemplate(this.settings.targetPathTemplate, targetDate);
      await this.writeToVault(path, md, this.settings.appendToFile);

      console.log('Fetch complete:', { parsed, path });
    } catch (error) {
      console.error('Error fetching daily text:', error);
      new Notice('Error fetching JW Daily Text (see console)');
    }
  }

  public scheduleDailyAutoFetch() {
    if (this.midnightTimeoutId) {
      window.clearTimeout(this.midnightTimeoutId);
      this.midnightTimeoutId = null;
    }
    if (this.dailyIntervalId) {
      window.clearInterval(this.dailyIntervalId);
      this.dailyIntervalId = null;
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 5, 0); // 00:00:05 local
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    this.midnightTimeoutId = window.setTimeout(async () => {
      await this.maybePerformAutoFetch();
      this.dailyIntervalId = window.setInterval(async () => {
        await this.maybePerformAutoFetch();
      }, 24 * 60 * 60 * 1000) as unknown as number;
    }, msUntilMidnight) as unknown as number;

    console.log('Scheduled JW auto-fetch to run in ms:', msUntilMidnight);
  }

  private async maybePerformAutoFetch() {
    console.log('JW Daily Text: performing auto-fetch');
    await this.fetchAndWriteDailyText(new Date());
  }
}

/* Settings tab */
class JWSettingTab extends PluginSettingTab {
  plugin: JWDailyTextPlugin;

  constructor(app: App, plugin: JWDailyTextPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const containerEl = this.containerEl;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'JW Daily Text settings' });

    new Setting(containerEl)
      .setName('Target file path template')
      .setDesc('Use {YYYY}, {MM}, {DD} in the template. Example: Daily/JW Daily Text - {YYYY}-{MM}-{DD}.md')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.targetPathTemplate)
          .setValue(this.plugin.settings.targetPathTemplate)
          .onChange(async (value: string) => {
            this.plugin.settings.targetPathTemplate = value.trim() || DEFAULT_SETTINGS.targetPathTemplate;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Append to file')
      .setDesc('If true, new daily text will be appended. If false, the target file will be overwritten.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.appendToFile).onChange(async (value: boolean) => {
          this.plugin.settings.appendToFile = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Auto-fetch daily')
      .setDesc('If enabled, the plugin will automatically fetch the daily text once per day at midnight.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoFetchDaily).onChange(async (value: boolean) => {
          this.plugin.settings.autoFetchDaily = value;
          await this.plugin.saveSettings();

          if (value) {
            this.plugin.scheduleDailyAutoFetch();
            new Notice('JW Daily Text: auto-fetch enabled (runs at local midnight)');
          } else {
            if (this.plugin.midnightTimeoutId) {
              window.clearTimeout(this.plugin.midnightTimeoutId);
              this.plugin.midnightTimeoutId = null;
            }
            if (this.plugin.dailyIntervalId) {
              window.clearInterval(this.plugin.dailyIntervalId);
              this.plugin.dailyIntervalId = null;
            }
            new Notice('JW Daily Text: auto-fetch disabled');
          }
        })
      );

    new Setting(containerEl)
      .setName('Manual fetch now')
      .setDesc('Click to fetch the daily text immediately and write it to the target file.')
      .addButton((btn) =>
        btn.setButtonText('Fetch Now').setCta().onClick(async () => {
          await this.plugin.fetchAndWriteDailyText();
        })
      );

    containerEl.createEl('hr');
    containerEl.createEl('p', {
      text:
        'Note: This plugin fetches JSON from wol.jw.org using requestUrl (no CORS in desktop Obsidian). If fetching fails due to remote changes, check the console for details.'
    });
  }
}