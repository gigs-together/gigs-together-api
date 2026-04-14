import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

/**
 * Smoke test: fails if SWC does not emit decorator metadata, because Nest resolves `NestDiSmokeServiceA`’s
 * `NestDiSmokeServiceB` constructor parameter via `design:paramtypes` (no `@Inject()` tokens).
 *
 * Regression: set `jsc.transform.decoratorMetadata` to `false` in `vitest.config.ts` (keep `legacyDecorator` / `parser.decorators`) and run this file — `Test.createTestingModule` should fail
 * to resolve `NestDiSmokeServiceA`.
 */
@Injectable()
class NestDiSmokeServiceB {
  readonly marker = 'nest-di-smoke-b';
}

@Injectable()
class NestDiSmokeServiceA {
  constructor(readonly dep: NestDiSmokeServiceB) {}
}

describe('Nest DI with emitted decorator metadata (Vitest + SWC)', () => {
  it('resolves constructor injection when metadata is emitted', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NestDiSmokeServiceA, NestDiSmokeServiceB],
    }).compile();

    const a = module.get(NestDiSmokeServiceA);
    expect(a).toBeInstanceOf(NestDiSmokeServiceA);
    expect(a.dep).toBeInstanceOf(NestDiSmokeServiceB);
    expect(a.dep.marker).toBe('nest-di-smoke-b');
  });
});
