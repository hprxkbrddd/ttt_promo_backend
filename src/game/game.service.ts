import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type GameStatus = 'in_progress' | 'win' | 'lose' | 'draw';

type Cell = 0 | 1 | 2; // 0 empty, 1 player X, 2 bot O

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  // 0 empty, 1 player X, 2 bot O
  private readonly PLAYER: 1 | 2 = 1;
  private readonly BOT: 1 | 2 = 2;

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Stateless game step:
   * - validates board & move
   * - applies player move
   * - checks result
   * - applies bot move (if needed)
   * - checks result again
   *
   * IMPORTANT (new flow):
   * - On player WIN мы НЕ выдаём промокод
   * - Мы только фиксируем факт победы: upsert в таблицу game_wins(session_id)
   * - Дальше фронт показывает ссылку на бота, а бот по /start проверит победу и наличие промокодов
   */
  async move(sessionId: string | undefined, board: Cell[], cellIndex: number) {
    // validate board
    if (!Array.isArray(board) || board.length !== 9) {
      throw new BadRequestException('board must be an array of length 9');
    }
    for (const v of board) {
      if (v !== 0 && v !== 1 && v !== 2) {
        throw new BadRequestException('board values must be 0|1|2');
      }
    }
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
      throw new BadRequestException('cellIndex must be 0..8');
    }
    if (board[cellIndex] !== 0) {
      throw new BadRequestException('cell is not empty');
    }

    // apply player move
    const next = board.slice() as Cell[];
    next[cellIndex] = this.PLAYER;

    // check player result
    const afterPlayer = this.getStatus(next);
    if (afterPlayer === 'win') {
      await this.recordWin(sessionId);
      return { status: 'win' as const, board: next };
    }
    if (afterPlayer === 'draw') {
      return { status: 'draw' as const, board: next };
    }

    // bot move
    const botIndex = this.chooseBotMove(next);
    if (botIndex !== -1) next[botIndex] = this.BOT;

    const afterBot = this.getStatus(next);
    if (afterBot === 'lose') {
      return { status: 'lose' as const, board: next };
    }
    if (afterBot === 'draw') {
      return { status: 'draw' as const, board: next };
    }

    return { status: 'in_progress' as const, board: next };
  }

  private async recordWin(sessionId?: string) {
    const sid = sessionId?.trim();
    if (!sid) {
      // лучше не падать: победа остаётся победой, просто не будет возможности получить код в боте
      this.logger.warn('Win recorded skipped: sessionId is missing');
      return;
    }

    // Таблица должна существовать:
    // create table game_wins (session_id text primary key, won_at timestamptz not null default now());
    const { error } = await this.supabase.client
      .from('game_wins')
      .upsert({ session_id: sid }, { onConflict: 'session_id' });

    if (error) {
      // Не ломаем игру из-за аналитики/фиксации победы, но логируем
      this.logger.error('Failed to record win in game_wins', JSON.stringify(error));
    }
  }

  /** Status relative to player: win=player won, lose=bot won */
  private getStatus(board: Cell[]): GameStatus {
    const winner = this.getWinner(board);
    if (winner === this.PLAYER) return 'win';
    if (winner === this.BOT) return 'lose';
    if (board.every((c) => c !== 0)) return 'draw';
    return 'in_progress';
  }

  private getWinner(b: Cell[]): 0 | 1 | 2 {
    const lines: ReadonlyArray<readonly [number, number, number]> = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const [a, c, d] of lines) {
      if (b[a] !== 0 && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return 0;
  }

  /**
   * AI: “умный, но даёт шанс”.
   * 65% — оптимальный ход, 35% — случайный среди предпочтительных.
   */
  private chooseBotMove(board: Cell[]): number {
    const empty = this.getEmpty(board);
    if (empty.length === 0) return -1;

    // 1) bot can win -> win
    const winMove = this.findWinningMove(board, this.BOT);
    if (winMove !== -1) return winMove;

    // 2) player can win -> usually block (but not always)
    const blockMove = this.findWinningMove(board, this.PLAYER);
    if (blockMove !== -1) {
      const shouldBlock = Math.random() < 0.8;
      if (shouldBlock) return blockMove;
      // else: “human mistake”
    }

    // 3) prefer center -> corners -> edges
    const preferred = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((i) => board[i] === 0);

    const optimal = preferred[0] ?? empty[0];

    if (Math.random() < 0.65) return optimal;

    const top = preferred.slice(0, Math.min(3, preferred.length));
    return top[Math.floor(Math.random() * top.length)] ?? optimal;
  }

  private getEmpty(board: Cell[]) {
    const r: number[] = [];
    for (let i = 0; i < 9; i++) if (board[i] === 0) r.push(i);
    return r;
  }

  private findWinningMove(board: Cell[], who: 1 | 2): number {
    for (const idx of this.getEmpty(board)) {
      const t = board.slice() as Cell[];
      t[idx] = who;
      if (this.getWinner(t) === who) return idx;
    }
    return -1;
  }
}
