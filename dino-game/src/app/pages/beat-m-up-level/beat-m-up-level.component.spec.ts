import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeatMUpLevelComponent } from './beat-m-up-level.component';

describe('BeatMUpLevelComponent', () => {
  let component: BeatMUpLevelComponent;
  let fixture: ComponentFixture<BeatMUpLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BeatMUpLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BeatMUpLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
