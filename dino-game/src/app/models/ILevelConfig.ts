export interface ILevelConfig {
  id: string;
  title: string;
  description?: string;
  type: LevelType;
}

export type LevelType = 'runner' | 'beat-em-up' | 'space-invaders';
