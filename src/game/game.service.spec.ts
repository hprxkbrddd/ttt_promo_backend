import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from './game.service';
import { TelegramService } from '../telegram/telegram.service';
import { PromoService } from '../promo/promo.service';

describe('GameService', () => {
  let service: GameService;

  const telegramMock = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };

  const promoMock = {
    takeFreeCode: jest.fn().mockResolvedValue('TEST-CODE'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        { provide: TelegramService, useValue: telegramMock },
        { provide: PromoService, useValue: promoMock },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('handleWin: should take promo and send telegram message', async () => {
    const code = await service.handleWin('session-1');

    expect(code).toBe('TEST-CODE');
    expect(promoMock.takeFreeCode).toHaveBeenCalledWith('session-1');
    expect(telegramMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramMock.sendMessage.mock.calls[0][0]).toContain('TEST-CODE');
  });

  it('handleLose: should send lose message', async () => {
    await service.handleLose('session-1');

    expect(telegramMock.sendMessage).toHaveBeenCalledWith('❌ Проигрыш');
  });
});
