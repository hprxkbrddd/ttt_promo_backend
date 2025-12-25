import { Test, TestingModule } from '@nestjs/testing';
import { GameController } from './game.controller';
import { GameService } from './game.service';

describe('GameController', () => {
  let controller: GameController;

  const gameServiceMock = {
    handleWin: jest.fn().mockResolvedValue('TEST-CODE'),
    handleLose: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameController],
      providers: [{ provide: GameService, useValue: gameServiceMock }],
    }).compile();

    controller = module.get<GameController>(GameController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('win: should return promoCode', async () => {
    const res = await controller.win({ sessionId: 's1' });

    expect(res).toEqual({ success: true, promoCode: 'TEST-CODE' });
    expect(gameServiceMock.handleWin).toHaveBeenCalledWith('s1');
  });

  it('lose: should return success', async () => {
    const res = await controller.lose({ sessionId: 's1' });

    expect(res).toEqual({ success: true });
    expect(gameServiceMock.handleLose).toHaveBeenCalledWith('s1');
  });
});
