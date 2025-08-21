import { TestBed } from '@angular/core/testing';
import { CanMatchFn } from '@angular/router';

import { levelUnlockGuard } from './level-unlock.guard';

describe('levelUnlockGuard', () => {
  const executeGuard: CanMatchFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => levelUnlockGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
