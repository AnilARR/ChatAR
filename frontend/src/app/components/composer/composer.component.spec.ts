import { TestBed } from '@angular/core/testing';
import { ComposerComponent } from './composer.component';

describe('ComposerComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(ComposerComponent);
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const sent: string[] = [];
    fixture.componentInstance.send.subscribe((t) => sent.push(t));
    const type = (value: string) => {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input'));
    };
    const press = (init: KeyboardEventInit) => textarea.dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }));
    return { fixture, textarea, sent, type, press };
  }

  it('sends on Enter and clears the input', () => {
    const { textarea, sent, type, press } = setup();
    type('Hello');
    press({ key: 'Enter' });
    expect(sent).toEqual(['Hello']);
    expect(textarea.value).toBe('');
  });

  it('does not send on Shift+Enter', () => {
    const { sent, type, press } = setup();
    type('Line 1');
    press({ key: 'Enter', shiftKey: true });
    expect(sent).toEqual([]);
  });

  it('does not send while generating', () => {
    const { fixture, sent, type, press } = setup();
    fixture.componentRef.setInput('isGenerating', true);
    fixture.detectChanges();
    type('Hello');
    press({ key: 'Enter' });
    expect(sent).toEqual([]);
    expect(fixture.nativeElement.querySelector('[aria-label="Stop generating"]')).toBeTruthy();
  });
});
