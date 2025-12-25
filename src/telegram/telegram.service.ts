// src/telegram/telegram.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SupabaseService } from '../supabase/supabase.service';
import { PromoService } from '../promo/promo.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  private readonly token: string;

  // getUpdates offset (в памяти). Для прод лучше хранить в БД/redis или использовать webhook.
  private offset = 0;

  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly promo: PromoService,
  ) {
    this.token = this.normalizeEnvValue(this.config.get<string>('TELEGRAM_BOT_TOKEN'));
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is missing');
  }

  onModuleInit() {
    // стартуем polling автоматически
    this.startPolling();
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private api(method: string) {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  private normalizeEnvValue(v?: string): string {
    if (!v) return '';
    let s = v.replace(/^\uFEFF/, '').replace(/\r/g, '').replace(/\n/g, '').trim();

    if (
      (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    ) {
      s = s.slice(1, -1).trim();
    }

    return s.replace(/\r/g, '').replace(/\n/g, '');
  }

  // ----------------------------
  // Polling loop
  // ----------------------------
  startPolling(intervalMs = 2000) {
    if (this.running) return;
    this.running = true;

    const tick = async () => {
      try {
        await this.syncUpdatesOnce();
      } catch (e: any) {
        this.logger.warn(`Telegram polling error: ${e?.message ?? String(e)}`);
      } finally {
        if (!this.running) return;
        this.timer = setTimeout(tick, intervalMs);
      }
    };

    tick();
    this.logger.log('Telegram polling started');
  }

  stopPolling() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.logger.log('Telegram polling stopped');
  }

  async syncUpdatesOnce(): Promise<void> {
    const res = await axios.get(this.api('getUpdates'), {
      params: {
        timeout: 10,
        offset: this.offset ? this.offset + 1 : undefined,
        allowed_updates: ['message'],
      },
      timeout: 15_000,
    });

    if (!res.data?.ok) return;

    const updates: any[] = res.data.result ?? [];
    if (updates.length === 0) return;

    for (const u of updates) {
      this.offset = Math.max(this.offset, u.update_id ?? 0);

      const msg = u?.message;
      const chat = msg?.chat;
      const text: string | undefined = msg?.text;

      if (!chat?.id || !text) continue;

      if (text.startsWith('/start')) {
        await this.handleStart(chat.id, text);
      }
    }
  }

  // ----------------------------
  // Core logic: /start <sessionId>
  // ----------------------------
  private async handleStart(chatId: number, text: string) {
    const payload = text.split(' ')[1]?.trim(); // /start <payload>

    if (!payload) {
      await this.sendMessage(
        chatId,
        'Привет! Вернитесь в игру и откройте ссылку на бота после победы ✨',
      );
      return;
    }

    // базовая проверка payload (у тебя sessionId вида s_<uuid>)
    if (!/^s_[0-9a-fA-F-]{10,}$/.test(payload)) {
      await this.sendMessage(
        chatId,
        'Не вижу корректной игровой ссылки. Откройте бота через кнопку из игры после победы 🙂',
      );
      return;
    }

    // 1) Проверяем, что сессия действительно выигрывала
    const won = await this.hasWin(payload);
    if (!won) {
      await this.sendMessage(
        chatId,
        'Пока победа не зафиксирована 😌\nСначала выиграйте в игре, затем вернитесь сюда по ссылке.',
      );
      return;
    }

    // 2) Пробуем выдать (или вернуть уже выданный) промокод
    try {
      const code = await this.promo.takeFreeCode(`tg:${chatId}`); // used_by = sessionId (идемпотентно)
      await this.sendMessage(chatId, `🎉 Победа! Промокод выдан: ${code}`);
    } catch (e: any) {
      // Если промокоды закончились или Supabase недоступен — без подробностей пользователю
      this.logger.warn(`Promo выдача не удалась для session ${`tg:${chatId}`}: ${e?.message ?? String(e)}`);
      await this.sendMessage(
        chatId,
        'Похоже, промокоды закончились 😔\nПопробуйте позже или напишите в поддержку.',
      );
    }
  }

  private async hasWin(sessionId: string): Promise<boolean> {
    // Таблица должна существовать:
    // create table game_wins (session_id text primary key, won_at timestamptz not null default now());
    const { data, error } = await this.supabase.client
      .from('game_wins')
      .select('session_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`Supabase game_wins read error: ${JSON.stringify(error)}`);
      return false;
    }
    return !!data?.session_id;
  }

  // ----------------------------
  // Low-level send
  // ----------------------------
  async sendMessage(chatId: number, text: string): Promise<void> {
    const res = await axios.post(
      this.api('sendMessage'),
      { chat_id: chatId, text },
      { timeout: 10_000 },
    );

    if (!res.data?.ok) {
      this.logger.error('Telegram sendMessage ok=false', res.data);
    }
  }
}
