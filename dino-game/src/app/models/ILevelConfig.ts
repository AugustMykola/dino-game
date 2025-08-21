export interface ILevelConfig {
  id: string;
  title: string;
  description?: string;
  type: LevelType;
}

export type LevelType = 'runner' | 'beet-m-up' | 'space-invaders';
