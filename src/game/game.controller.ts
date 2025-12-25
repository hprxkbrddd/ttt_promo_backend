import { Body, Controller, Post } from '@nestjs/common';
import { GameService } from './game.service';
import { MoveDto } from './dto/move.dto';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('move')
  async move(@Body() dto: MoveDto) {
    const result = await this.gameService.move(dto.sessionId, dto.board, dto.cellIndex);
    return { success: true, ...result };
  }
}
