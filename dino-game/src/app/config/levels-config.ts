import {ILevelConfig, LevelType} from '../models/ILevelConfig';
import {Type} from '@angular/core';

export const LEVELS: ILevelConfig[] = [
  {
    id: '1',
    title: 'Dino Run',
    description: 'A simple runner where you control a dino, avoid obstacles, and collect bonuses. Perfect for quick fun sessions.',
    type: 'runner'
  },
  {
    id: '2',
    title: 'Dino Fight',
    description: 'A dynamic beat-em-up: fight waves of enemies, perform combo attacks, and use special moves. A bit more challenging, requiring both reflexes and strategy.',
    type: 'beat-em-up'
  },
  {
    id: '3',
    title: 'Dino Space',
    description: 'A hardcore arcade in the style of Space Invaders: pilot a dino spaceship and battle alien forces. Fast enemy attacks, bosses, and a true challenge for players.',
    type: 'space-invaders'
  }

];

export const LEVEL_COMPONENT_LOADERS_BY_TYPE: Record<LevelType, () => Promise<Type<any>>> = {
  runner: () => import('../pages/runner-level/runner-level.component')
    .then(m => m.RunnerLevelComponent),
  'beat-em-up': () => import('../pages/beat-m-up-level/beat-m-up-level.component')
    .then(m => m.BeatMUpLevelComponent),
  'space-invaders': () => import('../pages/space-invadres-level/space-invadres-level.component')
    .then(m => m.SpaceInvadresLevelComponent),
};
