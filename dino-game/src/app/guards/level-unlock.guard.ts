import { CanMatchFn } from '@angular/router';

export const levelUnlockGuard: CanMatchFn = (route, segments) => {
  return true;
};
