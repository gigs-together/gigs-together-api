import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DigestController } from './digest.controller';
import { DigestPublishGuard } from './guards/digest-publish.guard';
import { DigestService } from './digest.service';

describe('DigestController', () => {
  let controller: DigestController;

  const publishMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    publishMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DigestController],
      providers: [
        {
          provide: DigestService,
          useValue: {
            publish: publishMock,
          },
        },
      ],
    })
      .overrideGuard(DigestPublishGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DigestController>(DigestController);
  });

  describe('publishDigest', () => {
    it('should resolve without body and invoke digest publish', async () => {
      await expect(controller.publishDigest()).resolves.toBeUndefined();

      expect(publishMock).toHaveBeenCalledTimes(1);
    });
  });
});
