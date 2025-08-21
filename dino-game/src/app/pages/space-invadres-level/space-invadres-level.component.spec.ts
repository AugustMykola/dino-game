import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpaceInvadresLevelComponent } from './space-invadres-level.component';

describe('SpaceInvadresLevelComponent', () => {
  let component: SpaceInvadresLevelComponent;
  let fixture: ComponentFixture<SpaceInvadresLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpaceInvadresLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpaceInvadresLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
