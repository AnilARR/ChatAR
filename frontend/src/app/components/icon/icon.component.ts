import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'spark'
  | 'plus'
  | 'sidebar'
  | 'trash'
  | 'pencil'
  | 'copy'
  | 'check'
  | 'refresh'
  | 'arrow-up'
  | 'stop'
  | 'chat'
  | 'close'
  | 'alert'
  | 'code'
  | 'lightbulb'
  | 'mail'
  | 'database';

/** Inline SVG icons (stroke style, inherit currentColor) so the app has no icon-font dependency. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icon', 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="name() === 'spark' ? 2.2 : 1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.width.px]="size()"
      [style.height.px]="size()"
    >
      @switch (name()) {
        @case ('spark') {
          <path
            d="M12 9.8V2M13.1 10.09l2.65-4.59M13.91 10.9l6.75-3.9M14.2 12h5.3M13.91 13.1l6.75 3.9M13.1 13.91l2.65 4.59M12 14.2V22M10.9 13.91l-2.65 4.59M10.09 13.1l-6.75 3.9M9.8 12H4.5M10.09 10.9L3.34 7M10.9 10.09L8.25 5.5"
          />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('sidebar') {
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M9 4v16" />
        }
        @case ('trash') {
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        }
        @case ('pencil') {
          <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
        }
        @case ('copy') {
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        }
        @case ('check') {
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        }
        @case ('refresh') {
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        }
        @case ('arrow-up') {
          <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
        }
        @case ('stop') {
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
        }
        @case ('chat') {
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        }
        @case ('close') {
          <path d="M6 6l12 12M18 6L6 18" />
        }
        @case ('alert') {
          <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        }
        @case ('code') {
          <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
        }
        @case ('lightbulb') {
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
        }
        @case ('mail') {
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 6.5L12 13l8.5-6.5" />
        }
        @case ('database') {
          <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
          <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
        }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
}
