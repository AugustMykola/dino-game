import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeatEmUpGameComponent } from './beat-em-up-game.component';

describe('BeatEmUpGameComponent', () => {
  let component: BeatEmUpGameComponent;
  let fixture: ComponentFixture<BeatEmUpGameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BeatEmUpGameComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BeatEmUpGameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
