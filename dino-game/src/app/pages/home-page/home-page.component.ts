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

  levels = LEVELS;


}
