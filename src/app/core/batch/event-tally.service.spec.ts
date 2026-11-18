import { TestBed } from '@angular/core/testing';
import { EVENT_TALLY_KEY, EventTallyService } from './event-tally.service';

describe('EventTallyService', () => {
  beforeEach(() => localStorage.removeItem(EVENT_TALLY_KEY));
  afterEach(() => localStorage.removeItem(EVENT_TALLY_KEY));

  const create = (): EventTallyService => {
    TestBed.resetTestingModule();
    return TestBed.inject(EventTallyService);
  };

  it('record é idempotente e ignora vazio', () => {
    const t = create();
    t.record('1');
    t.record('1');
    t.record('');
    expect(t.count()).toBe(1);
  });

  it('persiste e recarrega no construtor', () => {
    create().record('7');
    const again = create();
    expect(again.count()).toBe(1);
    expect(again.produced().has('7')).toBe(true);
  });

  it('clear zera e persiste', () => {
    const t = create();
    t.record('3');
    t.clear();
    expect(t.count()).toBe(0);
    expect(create().count()).toBe(0);
  });

  it('storage corrompido começa vazio', () => {
    localStorage.setItem(EVENT_TALLY_KEY, '{nao-json');
    expect(create().count()).toBe(0);
  });
});
