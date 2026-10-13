import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { ChatMessage } from '../../models/chat.models';
import { MessageComponent } from '../message/message.component';

/** Distance from the bottom (px) within which we keep following new content. */
const STICK_THRESHOLD = 80;

/**
 * Scrollable list of messages. Auto-scrolls to the newest content unless the user has
 * scrolled up to read something; sending a new message always jumps back to the bottom.
 */
@Component({
  selector: 'app-chat-thread',
  imports: [MessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(scroll)': 'onScroll()' },
  styles: `
    :host {
      display: block;
      flex: 1;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .thread {
      display: flex;
      flex-direction: column;
      gap: 28px;
      max-width: var(--content-width);
      margin: 0 auto;
      padding: 24px 16px 32px;
    }
  `,
  template: `
    <div class="thread" role="log" aria-live="polite" aria-relevant="additions">
      @for (m of messages(); track m.id; let last = $last) {
        <app-message [message]="m" [canRegenerate]="last && canRegenerate()" (regenerate)="regenerate.emit()" />
      }
    </div>
  `,
})
export class ChatThreadComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly messages = input.required<ChatMessage[]>();
  readonly canRegenerate = input(false);
  readonly regenerate = output<void>();

  /** Plain field (not a signal): it only steers scrolling and must not trigger re-renders. */
  private stickToBottom = true;
  private lastCount = 0;
  private lastFirstId: string | undefined;

  constructor() {
    afterRenderEffect(() => {
      const messages = this.messages();
      const last = messages.at(-1);
      // Read the last message's text so every streamed chunk re-runs this effect.
      void last?.content;

      const switchedChat = messages[0]?.id !== this.lastFirstId;
      const userJustSent = messages.length > this.lastCount && last?.role === 'user';
      this.lastFirstId = messages[0]?.id;
      this.lastCount = messages.length;
      if (switchedChat || userJustSent) this.stickToBottom = true;

      if (this.stickToBottom) {
        const el = this.host.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  protected onScroll(): void {
    const el = this.host.nativeElement;
    this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  }
}
