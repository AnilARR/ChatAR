import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { ChatStore } from '../../services/chat.store';
import { IconComponent } from '../icon/icon.component';

/** Left sidebar: brand, "New chat" and the "Recents" list with rename/delete. */
@Component({
  selector: 'app-sidebar',
  imports: [IconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  protected readonly store = inject(ChatStore);

  /** Emitted after the user picks something, so the mobile drawer can close. */
  readonly navigated = output<void>();
  readonly closeRequested = output<void>();

  /** Id of the conversation being renamed, if any. */
  protected readonly editingId = signal<string | null>(null);
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  protected newChat(): void {
    this.store.newChat();
    this.navigated.emit();
  }

  protected select(id: string): void {
    if (this.editingId() === id) return;
    this.store.select(id);
    this.navigated.emit();
  }

  protected startRename(id: string, event: Event): void {
    event.stopPropagation();
    this.editingId.set(id);
    // Focus after the input is rendered.
    queueMicrotask(() => {
      const el = this.renameInput()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }

  protected commitRename(id: string, value: string): void {
    if (this.editingId() !== id) return;
    this.store.rename(id, value);
    this.editingId.set(null);
  }

  protected cancelRename(): void {
    this.editingId.set(null);
  }

  protected remove(id: string, title: string, event: Event): void {
    event.stopPropagation();
    if (confirm(`Delete "${title}"? This cannot be undone.`)) {
      this.store.delete(id);
    }
  }
}
