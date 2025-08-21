import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { levelUnlockGuard } from './guards/level-unlock.guard'; // залишаємо, якщо є прогресія

export const appRoutes: Routes = [
  {
    path: '',
    component: HomePageComponent,
    title: 'Level Library',
    children: [
      {
        path: 'level/1',
        loadComponent: () =>
          import('./pages/runner-level/runner-level.component')
            .then(m => m.RunnerLevelComponent),
        title: 'Level 1 — Runner',
        data: { levelId: '1', type: 'runner' },
        canMatch: [levelUnlockGuard],
      },
      {
        path: 'level/2',
        loadComponent: () =>
          import('./pages/beat-m-up-level/beat-m-up-level.component')
            .then(m => m.BeatMUpLevelComponent),
        title: 'Level 2 — Beat ’em Up',
        data: { levelId: '2', type: 'beat-em-up' },
        canMatch: [levelUnlockGuard],
      },
      {
        path: 'level/3',
        loadComponent: () =>
          import('./pages/space-invadres-level/space-invadres-level.component')
            .then(m => m.SpaceInvadresLevelComponent),
        title: 'Level 3 — Space Invaders',
        data: { levelId: '3', type: 'space-invaders' },
        canMatch: [levelUnlockGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
