import { Injectable } from '@angular/core';
import { Marked } from 'marked';

/**
 * Converts Markdown to an HTML string.
 *
 * Security: the result is bound with [innerHTML], so Angular's built-in sanitizer still runs
 * on it (scripts, event handlers and javascript: URLs are stripped). In addition, raw HTML
 * inside the Markdown is escaped and shown as text rather than rendered.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly marked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // Show raw HTML from the model as literal text.
      html: ({ text }) => escapeHtml(text),
    },
    hooks: {
      // Open links in a new tab without giving the target page access to window.opener.
      postprocess: (html) => html.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href='),
    },
  });

  render(markdown: string): string {
    return this.marked.parse(markdown, { async: false });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
