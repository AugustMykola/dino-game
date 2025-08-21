import {ILevelConfig, LevelType} from '../models/ILevelConfig';
import {Type} from '@angular/core';

export const LEVELS: ILevelConfig[] = [
  {id: '1', title: 'Рівень 1 — Розігрів', description: 'Легкий старт', type: 'runner'},
  {id: '2', title: 'Рівень 2 — Темп', description: 'Трохи складніше', type: 'beet-m-up'},
  {id: '3', title: 'Рівень 3 — Виклик', description: 'Хардкор', type: 'space-invaders'},
];

export const LEVEL_COMPONENT_LOADERS_BY_TYPE: Record<LevelType, () => Promise<Type<any>>> = {
  runner: () => import('../pages/runner-level/runner-level.component')
    .then(m => m.RunnerLevelComponent),
  'beet-m-up': () => import('../pages/beat-m-up-level/beat-m-up-level.component')
    .then(m => m.BeatMUpLevelComponent),
  'space-invaders': () => import('../pages/space-invadres-level/space-invadres-level.component')
    .then(m => m.SpaceInvadresLevelComponent),
};
