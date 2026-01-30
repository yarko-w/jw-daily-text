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
    // Split HTML into paragraphs
    const paragraphs = html.split(/<\/?p[^>]*>/).filter(p => p.trim() && p.length > 10);

    for (const para of paragraphs) {
      // Skip paragraphs that are just links or citations
      if (para.includes('<a href') && para.match(/<a[^>]*>.*?<\/a>/)?.[0] === para.trim()) {
        continue; // Skip paragraphs that are just links
      }

      const cleanPara = this.cleanHtml(para);

      // Skip if it looks like a citation (starts with dash or bible reference)
      if (cleanPara.match(/^—/) || cleanPara.match(/^\d+\s*[A-Za-z]+\./)) {
        continue;
      }

      // Skip date headers and day/month names
      if (cleanPara.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i) ||
          cleanPara.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/i) ||
          cleanPara.match(/^\d{1,2}, \d{4}$/) || // Date patterns like "30, 2026"
          cleanPara.match(/^\d{4}-\d{2}-\d{2}$/)) { // ISO date patterns
        continue;
      }

      // Skip if it's too short or looks like commentary
      if (cleanPara.length < 15 || cleanPara.includes('w24.') || cleanPara.includes('¶')) {
        continue;
      }

      // Additional check: scripture should contain typical scripture words/phrases
      // and not be just a header or title
      if (cleanPara.split(' ').length < 5) { // Too few words for scripture
        continue;
      }

      // This should be the scripture - clean up any trailing punctuation
      return cleanPara.replace(/[—\-]+$/, '').trim();
    }

    // Fallback to em content approach
    const emMatches = html.match(/<em>(.*?)<\/em>/gs);
    if (emMatches) {
      const emContents = emMatches.map(em => this.cleanHtml(em.replace(/<\/?em>/g, '')));
      for (const content of emContents) {
        if (!content.match(/^—/) && !content.match(/^\d+\s*[A-Za-z]+\./) && content.length > 10) {
          return content.replace(/[—\-]+$/, '').trim();
        }
      }
    }

    return '';
  }

  private extractCitation(html: string): string {
    // Look for citation patterns in em tags
    const emMatches = html.match(/<em>(.*?)<\/em>/gs);
    if (!emMatches) return '';

    const emContents = emMatches.map(em => this.cleanHtml(em.replace(/<\/?em>/g, '')));

    // Look for citation patterns: "—1 Cor. 13:8" or "1 Cor. 13:8"
    for (const content of emContents) {
      // Check for em dash followed by bible reference
      const citationMatch = content.match(/^—\s*([1-3]?\s*[A-Za-z]+\.?\s*\d+(?::\d+)?\.?)$/);
      if (citationMatch) {
        return citationMatch[1].trim();
      }
      // Check for bible reference pattern
      const bibleRefMatch = content.match(/^([1-3]?\s*[A-Za-z]+\.?\s*\d+(?::\d+)?\.?)$/);
      if (bibleRefMatch) {
        return bibleRefMatch[1].trim();
      }
    }

    // Fallback: second em tag if it exists
    if (emContents.length >= 2) {
      return emContents[1];
    }

    return '';
  }

  private extractCommentary(html: string): string {
    // Commentary is typically in the second or third <p> tag
    const pTags = html.split(/<p[^>]*>/);

    for (let i = 2; i < pTags.length; i++) {
      const pContent = pTags[i].split('</p>')[0];
      // Process links before cleaning HTML
      const withLinks = this.processLinks(pContent);
      const cleaned = this.cleanHtml(withLinks);

      // Skip if it's just the citation or empty
      if (cleaned && cleaned.length > 20) {
        return cleaned;
      }
    }

    return '';
  }

  private processLinks(html: string): string {
    // Convert JW.org links to markdown format
    return html.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2](https://wol.jw.org/en$1)');
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