import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl, TFile } from 'obsidian';

interface JWPluginSettings {
  targetPathTemplate: string;
  appendToFile: boolean;
  autoFetchDaily: boolean;
  lastAutoFetchDate?: string;
}

const DEFAULT_SETTINGS: JWPluginSettings = {
  targetPathTemplate: "Daily/JW Daily Text - {YYYY}-{MM}-{DD}.md",
  appendToFile: true,
  autoFetchDaily: false,
  lastAutoFetchDate: ""
};

export default class JWDailyTextPlugin extends Plugin {
  settings: JWPluginSettings;
  private midnightTimeoutId: number | null = null;
  private dailyIntervalId: number | null = null;

  async onload() {
    console.log('Loading JW Daily Text plugin');
    await this.loadSettings();

    this.addCommand({
      id: 'jw-fetch-daily-text',
      name: 'Fetch JW Daily Text',
      callback: async () => {
        await this.fetchAndWriteDailyText();
      }
    });

    this.addCommand({
      id: 'jw-open-settings',
      name: 'JW Daily Text: Open Settings',
      callback: () => {
        // settings tab will be opened by user in UI; this is a placeholder
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

  private buildUrlForDate(date: Date) {
    const yyyy = date.getFullYear();
    const mm = this.pad(date.getMonth() + 1);
    const dd = this.pad(date.getDate());
    return `https://wol.jw.org/wol/dt/r1/lp-e/${yyyy}/${mm}/${dd}`;
  }

  private formatPathTemplate(template: string, date: Date) {
    const YYYY = date.getFullYear().toString();
    const MM = this.pad(date.getMonth() + 1);
    const DD = this.pad(date.getDate());
    return template.replace(/{YYYY}/g, YYYY).replace(/{MM}/g, MM).replace(/{DD}/g, DD);
  }

  private parseDailyHtml(htmlString: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    const ems = Array.from(doc.querySelectorAll('em'));
    const scripture = ems[0]?.textContent?.trim() ?? '';
    const citation = ems[1]?.textContent?.trim() ?? '';

    const paragraphs = Array.from(doc.querySelectorAll('p'));
    let commentary = '';
    for (const p of paragraphs) {
      const txt = p.textContent?.trim() ?? '';
      if (!txt) continue;
      if (scripture && txt.includes(scripture)) continue;
      if (citation && txt.includes(citation)) continue;
      commentary = txt;
      break;
    }

    if (!commentary) {
      commentary = doc.body?.textContent?.trim() ?? '';
    }

    return { scripture, citation, commentary };
  }

  private buildMarkdownBlock(date: Date, parsed: { scripture: string; citation: string; commentary: string }) {
    const dateStr = date.toISOString().slice(0, 10);
    let md = `# JW Daily Text — ${dateStr}\n\n`;
    if (parsed.scripture) {
      md += `**Scripture:** ${parsed.scripture}\n\n`;
    }
    if (parsed.citation) {
      md += `**Citation:** ${parsed.citation}\n\n`;
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
          try {
            // @ts-ignore - Vault.append exists in Obsidian API
            await vault.append(path, content);
          } catch (e) {
            const current = await vault.read(existing as TFile);
            await vault.modify(existing as TFile, current + content);
          }
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

  async fetchAndWriteDailyText(forDate?: Date) {
    const targetDate = forDate ?? new Date();
    const url = this.buildUrlForDate(targetDate);

    new Notice('Fetching JW Daily Text...');
    console.log('Fetching JW Daily Text from:', url);

    try {
      const res = await requestUrl({ url, headers: { Accept: 'application/json' } });
      const text = res?.text ?? '';
      if (!text) throw new Error('Empty response from requestUrl');

      let json: any;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error('Failed to parse response JSON: ' + (err as Error).message);
      }

      if (!json.items || !json.items[0] || !json.items[0].content) {
        throw new Error('Unexpected response format (no items/content)');
      }

      const htmlContent: string = json.items[0].content;
      const parsed = this.parseDailyHtml(htmlContent);
      const md = this.buildMarkdownBlock(targetDate, parsed);

      const path = this.formatPathTemplate(this.settings.targetPathTemplate, targetDate);
      await this.writeToVault(path, md, this.settings.appendToFile);

      console.log('Fetch complete:', { parsed, path });
    } catch (error) {
      console.error('Error fetching daily text:', error);
      new Notice('Error fetching JW Daily Text (see console)');
    }
  }

  private scheduleDailyAutoFetch() {
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
    const todayIso = new Date().toISOString().slice(0, 10);
    if (this.settings.lastAutoFetchDate === todayIso) {
      console.log('JW Daily Text: already auto-fetched today, skipping.');
      return;
    }
    console.log('JW Daily Text: performing auto-fetch for today:', todayIso);
    await this.fetchAndWriteDailyText(new Date());
    this.settings.lastAutoFetchDate = todayIso;
    await this.saveSettings();
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
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'JW Daily Text settings' });

    new Setting(containerEl)
      .setName('Target file path template')
      .setDesc('Use {YYYY}, {MM}, {DD} in the template. Example: Daily/JW Daily Text - {YYYY}-{MM}-{DD}.md')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.targetPathTemplate)
          .setValue(this.plugin.settings.targetPathTemplate)
          .onChange(async (value) => {
            this.plugin.settings.targetPathTemplate = value.trim() || DEFAULT_SETTINGS.targetPathTemplate;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Append to file')
      .setDesc('If true, new daily text will be appended. If false, the target file will be overwritten.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.appendToFile).onChange(async (value) => {
          this.plugin.settings.appendToFile = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Auto-fetch daily')
      .setDesc('If enabled, the plugin will automatically fetch the daily text once per day at midnight.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoFetchDaily).onChange(async (value) => {
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