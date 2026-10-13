import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../icon/icon.component';

const MAX_HEIGHT_PX = 240;

/** Message input: auto-growing textarea, send/stop button and disclaimer. */
@Component({
  selector: 'app-composer',
  imports: [IconComponent],
  templateUrl: './composer.component.html',
  styleUrl: './composer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComposerComponent {
  readonly isGenerating = input(false);
  readonly placeholder = input('Message ChatAR…');

  readonly send = output<string>();
  readonly stop = output<void>();

  protected readonly maxLength = environment.maxMessageLength;
  protected readonly text = signal('');
  protected readonly canSend = computed(() => this.text().trim().length > 0 && !this.isGenerating());
  /** Show a counter only when the user gets close to the limit. */
  protected readonly showCounter = computed(() => this.text().length > this.maxLength * 0.8);

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');

  focus(): void {
    this.textarea().nativeElement.focus();
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.resize();
  }

  /** Enter sends, Shift+Enter inserts a newline; ignore Enter while an IME is composing. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(): void {
    if (!this.canSend()) return;
    this.send.emit(this.text().trim());
    this.text.set('');
    this.textarea().nativeElement.value = '';
    this.resize();
  }

  private resize(): void {
    const el = this.textarea().nativeElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }
}
