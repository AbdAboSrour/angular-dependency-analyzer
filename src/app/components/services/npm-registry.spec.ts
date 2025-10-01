import { TestBed } from '@angular/core/testing';

import { NpmRegistry } from './npm-registry';

describe('NpmRegistry', () => {
  let service: NpmRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NpmRegistry);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
