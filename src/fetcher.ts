import { requestUrl } from 'obsidian';

export interface DailyText {
  date: string;
  scripture: string;
  citation: string;
  commentary: string;
}

export class DailyTextFetcher {
  async fetchDailyText(): Promise<DailyText> {
    const now = new Date();
    const dateStr = this.formatDate(now);
    return this.fetchDailyTextForDate(dateStr);
  }

  async fetchDailyTextForDate(dateStr: string): Promise<DailyText> {
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    const url = `https://wol.jw.org/wol/dt/r1/lp-e/${yyyy}/${mm}/${dd}`;

    try {
      const response = await requestUrl({ url, headers: { Accept: 'application/json' } });
      const text = response?.text ?? '';
      if (!text) throw new Error('Empty response from requestUrl');

      let json: any;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error('Failed to parse response JSON: ' + (err as Error).message);
      }

      if (!json.items || json.items.length === 0) {
        throw new Error('No daily text found for this date');
      }

      const item = json.items[0];
      const htmlContent = item.content;

      return {
        date: dateStr,
        scripture: this.extractScripture(htmlContent),
        citation: this.extractCitation(htmlContent),
        commentary: this.extractCommentary(htmlContent)
      };
    } catch (error) {
      console.error('Error fetching daily text:', error);
      throw error;
    }
  }

  private extractScripture(html: string): string {
    // First, try to get the first <em> tag content
    const firstEmMatch = html.match(/<em>(.*?)<\/em>/s);
    if (!firstEmMatch) return '';

    const firstEmContent = this.cleanHtml(firstEmMatch[1]);

    // Check if citation is embedded in the scripture (contains em dash followed by book reference)
    // Pattern: text—Book chapter:verse or text—Book chapter
    const embeddedCitationMatch = firstEmContent.match(/^(.+?)—\s*([1-3]?\s*[A-Za-z]+\.?\s*\d+(?::\d+)?\.?)$/);

    if (embeddedCitationMatch) {
      // Citation is embedded, return just the scripture part (before the em dash)
      return embeddedCitationMatch[1].trim();
    }

    // No embedded citation, return the full content
    return firstEmContent;
  }

  private extractCitation(html: string): string {
    // First check if citation is embedded in the first <em> tag
    const firstEmMatch = html.match(/<em>(.*?)<\/em>/s);
    if (firstEmMatch) {
      const firstEmContent = this.cleanHtml(firstEmMatch[1]);

      // Check for embedded citation pattern
      const embeddedCitationMatch = firstEmContent.match(/—\s*([1-3]?\s*[A-Za-z]+\.?\s*\d+(?::\d+)?\.?)$/);
      if (embeddedCitationMatch) {
        return embeddedCitationMatch[1].trim();
      }
    }

    // If not embedded, try the second <em> tag (traditional format)
    const emTags = html.match(/<em>(.*?)<\/em>/gs);
    if (emTags && emTags.length >= 2) {
      const citation = emTags[1].replace(/<\/?em>/g, '');
      return this.cleanHtml(citation);
    }

    return '';
  }

  private extractCommentary(html: string): string {
    // Commentary is typically in the second or third <p> tag
    const pTags = html.split(/<p[^>]*>/);

    for (let i = 2; i < pTags.length; i++) {
      const pContent = pTags[i].split('</p>')[0];
      const cleaned = this.cleanHtml(pContent);

      // Skip if it's just the citation or empty
      if (cleaned && cleaned.length > 20) {
        return cleaned;
      }
    }

    return '';
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8203;/g, '') // Remove zero-width space
      .replace(/\u200B/g, '') // Remove zero-width space (Unicode)
      .trim();
  }

  private formatDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}