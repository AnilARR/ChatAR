import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { environment } from '../environments/environment';
import { ChatThreadComponent } from './components/chat-thread/chat-thread.component';
import { ComposerComponent } from './components/composer/composer.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { IconComponent } from './components/icon/icon.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatService } from './services/chat.service';
import { ChatStore } from './services/chat.store';

const MOBILE_QUERY = '(max-width: 767px)';

/** App shell: sidebar, header, thread/empty state and composer. */
@Component({
  selector: 'app-root',
  imports: [SidebarComponent, ChatThreadComponent, ComposerComponent, EmptyStateComponent, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onGlobalKeydown($event)' },
})
export class App implements OnInit {
  protected readonly store = inject(ChatStore);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly models = environment.models;
  protected readonly isMobile = signal(matchMedia(MOBILE_QUERY).matches);
  protected readonly sidebarOpen = signal(!matchMedia(MOBILE_QUERY).matches);
  protected readonly apiDown = signal(false);
  protected readonly hasMessages = computed(() => this.store.messages().length > 0);
  protected readonly title = computed(() => this.store.active()?.title ?? 'New chat');

  private readonly composer = viewChild.required(ComposerComponent);

  ngOnInit(): void {
    // Switch between docked sidebar (desktop) and slide-over drawer (mobile).
    const media = matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      this.isMobile.set(e.matches);
      this.sidebarOpen.set(!e.matches);
    };
    media.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));

    void this.checkApi();
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeSidebarOnMobile(): void {
    if (this.isMobile()) this.sidebarOpen.set(false);
    this.composer().focus();
  }

  protected async send(text: string): Promise<void> {
    if (this.apiDown()) void this.checkApi();
    await this.store.send(text);
  }

  protected onModelChange(event: Event): void {
    this.store.setModel((event.target as HTMLSelectElement).value);
  }

  protected async checkApi(): Promise<void> {
    this.apiDown.set(!(await this.chatService.isHealthy()));
  }

  /** Ctrl/Cmd+Shift+O starts a new chat; Escape stops generation or closes the drawer. */
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      this.store.newChat();
      this.composer().focus();
    } else if (event.key === 'Escape') {
      if (this.store.isGenerating()) this.store.stop();
      else if (this.isMobile() && this.sidebarOpen()) this.sidebarOpen.set(false);
    }
  }
}
