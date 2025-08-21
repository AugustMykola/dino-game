import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunnerGameComponent } from './runner-game.component';

describe('RunnerGameComponent', () => {
  let component: RunnerGameComponent;
  let fixture: ComponentFixture<RunnerGameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RunnerGameComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RunnerGameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
