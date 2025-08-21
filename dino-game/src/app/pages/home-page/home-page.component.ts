import {Component, computed, inject} from '@angular/core';
import {ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {LEVELS} from '../../config/levels-config';
import {NgClass} from '@angular/common';

@Component({
  selector: 'app-home-page',
  imports: [
    RouterOutlet,
    RouterLink,
    NgClass,
    RouterLinkActive
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss'
})
export class HomePageComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  // private levelsSvc = inject(LevelsService);

  levels = LEVELS;

  openLevel(id: string) {
    this.router.navigate(['level', id], { relativeTo: this.route });
  }

  isLevelOpen = computed(() => !!this.route.children.find(c => c.outlet === 'right'));

  isUnlocked = (id: string) => true;
  bestScore  = (id: string) => 1000;

}
