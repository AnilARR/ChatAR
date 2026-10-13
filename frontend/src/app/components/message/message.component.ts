import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessage } from '../../models/chat.models';
import { ClipboardService } from '../../services/clipboard.service';
import { MarkdownService } from '../../services/markdown.service';
import { IconComponent } from '../icon/icon.component';

/**
 * One message in the thread. User messages are plain-text bubbles; assistant messages are
 * rendered Markdown with copy buttons on code blocks and on the whole answer.
 */
@Component({
  selector: 'app-message',
  imports: [IconComponent],
  templateUrl: './message.component.html',
  styleUrl: './message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.user]': "message().role === 'user'",
    '[class.assistant]': "message().role === 'assistant'",
  },
})
export class MessageComponent {
  private readonly markdown = inject(MarkdownService);
  private readonly clipboard = inject(ClipboardService);

  readonly message = input.required<ChatMessage>();
  /** Whether the Regenerate action is offered on this message. */
  readonly canRegenerate = input(false);
  readonly regenerate = output<void>();

  protected readonly copied = signal(false);
  protected readonly isStreaming = computed(() => this.message().status === 'streaming');
  /** Typing indicator: waiting for the first token. */
  protected readonly isWaiting = computed(() => this.isStreaming() && !this.message().content);
  /** Bound with [innerHTML], so Angular's sanitizer runs on it. */
  protected readonly html = computed(() =>
    this.message().role === 'assistant' ? this.markdown.render(this.message().content) : '',
  );

  private readonly contentEl = viewChild<ElementRef<HTMLElement>>('content');

  constructor() {
    // Add a header with language label + copy button to every code block once the answer is complete.
    // (While streaming, the HTML is replaced on every chunk, so decoration waits until the end.)
    afterRenderEffect(() => {
      this.html();
      const root = this.contentEl()?.nativeElement;
      if (root && !this.isStreaming()) this.decorateCodeBlocks(root);
    });
  }

  protected async copyAnswer(): Promise<void> {
    if (await this.clipboard.copy(this.message().content)) this.flash(this.copied);
  }

  private decorateCodeBlocks(root: HTMLElement): void {
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-block')) return;

      const code = pre.querySelector('code');
      const language = /language-([\w+#-]+)/.exec(code?.className ?? '')?.[1] ?? 'code';

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      const header = document.createElement('div');
      header.className = 'code-header';
      const label = document.createElement('span');
      label.textContent = language;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', `Copy ${language} code`);
      button.addEventListener('click', async () => {
        if (await this.clipboard.copy(code?.textContent ?? pre.textContent ?? '')) {
          button.textContent = 'Copied!';
          setTimeout(() => (button.textContent = 'Copy'), 1500);
        }
      });

      header.append(label, button);
      pre.replaceWith(wrapper);
      wrapper.append(header, pre);
    });
  }

  private flash(flag: ReturnType<typeof signal<boolean>>): void {
    flag.set(true);
    setTimeout(() => flag.set(false), 1500);
  }
}
