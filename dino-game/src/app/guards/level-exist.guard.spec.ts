import { TestBed } from '@angular/core/testing';
import { CanMatchFn } from '@angular/router';

import { levelExistGuard } from './level-exist.guard';

describe('levelExistGuard', () => {
  const executeGuard: CanMatchFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => levelExistGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
