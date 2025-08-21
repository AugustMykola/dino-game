import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunnerLevelComponent } from './runner-level.component';

describe('RunnerLevelComponent', () => {
  let component: RunnerLevelComponent;
  let fixture: ComponentFixture<RunnerLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RunnerLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RunnerLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
