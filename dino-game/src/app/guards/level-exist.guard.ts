import {CanMatchFn, Router} from '@angular/router';
import {inject} from '@angular/core';
import {LEVEL_COMPONENT_LOADERS_BY_TYPE, LEVELS} from '../config/levels-config';
import {ILevelConfig} from '../models/ILevelConfig';

export const levelExistGuard: CanMatchFn = (route, segments) => {
  const router = inject(Router);
  const segmentId: string = segments.at(-1)?.path ?? '';

  const existInConfig = LEVELS.some((level: ILevelConfig) => level.id === segmentId);
  const hasLoader = Object.prototype.hasOwnProperty.call(LEVEL_COMPONENT_LOADERS_BY_TYPE, segmentId);

  return (existInConfig && hasLoader) ? true : router.createUrlTree(['/']);
};
