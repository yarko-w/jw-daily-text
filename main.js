const { Plugin, Notice, requestUrl } = require('obsidian');

module.exports = class JWDailyTextPlugin extends Plugin {
  onload() {
    console.log('Loading JW Daily Text (Test) plugin');
    this.addCommand({
      id: 'jw-fetch-daily-text',
      name: 'Fetch JW Daily Text',
      callback: async () => {
        await this.fetchDailyText();
      },
    });
  }

  onunload() {
    console.log('Unloading JW Daily Text (Test) plugin');
  }

  // Helper to zero-pad
  pad(n) {
    return String(n).padStart(2, '0');
  }

  buildUrlForDate(date) {
    const yyyy = date.getFullYear();
    const mm = this.pad(date.getMonth() + 1);
    const dd = this.pad(date.getDate());
    return `https://wol.jw.org/wol/dt/r1/lp-e/${yyyy}/${mm}/${dd}`;
  }

  async fetchDailyText(forDate = new Date()) {
    const url = this.buildUrlForDate(forDate);
    new Notice('Fetching JW Daily Text...');
    console.log('JW Daily Text: fetching from', url);

    try {
      // Use requestUrl to avoid CORS (runs via Electron's network layer on desktop)
      const res = await requestUrl({
        url,
        headers: { Accept: 'application/json' },
        // timeout: 30_000 // optional
      });

      // requestUrl returns text, so parse JSON safely
      const text = res.text;
      if (!text) throw new Error('Empty response from requestUrl');

      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error('Failed to parse response JSON: ' + err.message);
      }

      if (!json.items || !json.items[0] || !json.items[0].content) {
        throw new Error('Unexpected response format (no items/content)');
      }

      const html = json.items[0].content;
      const parsed = this.parseDailyHtml(html);
      const md = this.buildMarkdown(forDate, parsed);

      const path = 'JW Daily Text.md'; // quick test target path (vault root)
      await this.writeToVault(path, md, true);

      console.log('JW Daily Text fetched and written:', { parsed, path });
      new Notice('JW Daily Text fetched and written to ' + path);
    } catch (err) {
      console.error('Error fetching JW Daily Text:', err);
      new Notice('Error fetching JW Daily Text — see console');
    }
  }

  parseDailyHtml(htmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');

      const ems = Array.from(doc.querySelectorAll('em'));
      const scripture = (ems[0] && ems[0].textContent && ems[0].textContent.trim()) || '';
      const citation = (ems[1] && ems[1].textContent && ems[1].textContent.trim()) || '';

      // Find the first meaningful paragraph that isn't just the header/em text
      const paragraphs = Array.from(doc.querySelectorAll('p'));
      let commentary = '';
      for (const p of paragraphs) {
        const txt = (p.textContent || '').trim();
        if (!txt) continue;
        // Skip if it is the scripture or citation repeated
        if (scripture && txt.includes(scripture)) continue;
        if (citation && txt.includes(citation)) continue;
        commentary = txt;
        break;
      }

      if (!commentary) {
        // Fallback to plain body text (trimmed)
        commentary = (doc.body && doc.body.textContent && doc.body.textContent.trim()) || '';
      }

      return { scripture, citation, commentary };
    } catch (e) {
      console.error('parseDailyHtml error', e);
      return { scripture: '', citation: '', commentary: '' };
    }
  }

  buildMarkdown(date, parsed) {
    const dateStr = date.toISOString().slice(0, 10);
    let md = `# JW Daily Text — ${dateStr}\n\n`;
    if (parsed.scripture) md += `**Scripture:** ${parsed.scripture}\n\n`;
    if (parsed.citation) md += `**Citation:** ${parsed.citation}\n\n`;
    if (parsed.commentary) md += `${parsed.commentary}\n\n`;
    md += '---\n\n';
    return md;
  }

  async writeToVault(path, content, append = true) {
    const vault = this.app.vault;
    try {
      const existing = vault.getAbstractFileByPath(path);
      if (!existing) {
        await vault.create(path, content);
      } else {
        if (append) {
          // Attempt vault.append, fallback to read+modify
          try {
            // @ts-ignore (append exists in Obsidian Vault API)
            await vault.append(path, content);
          } catch (e) {
            const current = await vault.read(existing);
            await vault.modify(existing, current + content);
          }
        } else {
          await vault.modify(existing, content);
        }
      }
    } catch (err) {
      console.error('Error writing to vault', err);
      new Notice('Error writing to vault — see console');
    }
  }
};