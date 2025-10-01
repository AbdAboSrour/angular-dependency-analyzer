import { TestBed } from '@angular/core/testing';

import { DependencyAnalyzer } from './dependency-analyzer';

describe('DependencyAnalyzer', () => {
  let service: DependencyAnalyzer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DependencyAnalyzer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
