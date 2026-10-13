import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';

interface Suggestion {
  icon: IconName;
  label: string;
  prompt: string;
}

/**
 * Greeting and suggestion chips shown before the first message of a chat.
 * The host uses `display: contents`, so the parent can place the composer between
 * the greeting (order 0) and the chips (order 2) without re-creating the composer.
 */
@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './empty-state.component.scss',
  template: `
    <div class="greeting">
      <app-icon name="spark" [size]="40" class="spark" />
      <h1>How can I help you today?</h1>
    </div>
    <div class="chips">
      @for (s of suggestions; track s.label) {
        <button type="button" class="chip" (click)="pick.emit(s.prompt)">
          <app-icon [name]="s.icon" [size]="16" />
          {{ s.label }}
        </button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  /** Emits the full prompt of the clicked suggestion. */
  readonly pick = output<string>();

  protected readonly suggestions: Suggestion[] = [
    { icon: 'code', label: 'Code', prompt: 'Write a TypeScript function that debounces another function, with an example.' },
    { icon: 'lightbulb', label: 'Learn', prompt: 'Explain how HTTPS keeps my data safe, in simple terms.' },
    { icon: 'mail', label: 'Write', prompt: 'Draft a short, polite follow-up email after a job interview.' },
    { icon: 'database', label: 'SQL', prompt: 'Write a SQL Server query that finds duplicate rows in a table and explain it.' },
  ];
}
