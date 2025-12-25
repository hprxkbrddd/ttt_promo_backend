import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  public readonly client: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.norm(this.config.get<string>('SUPABASE_URL'));
    const key = this.norm(this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'));

    if (!url) throw new Error('SUPABASE_URL is missing');
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');

    // Базовая валидация, чтобы не ловить “502 из ниоткуда”
    if (!/^https:\/\/.+/.test(url)) {
      throw new Error('SUPABASE_URL must start with https://');
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  private norm(v?: string): string {
    if (!v) return '';
    let s = v.trim();

    // снять внешние кавычки
    if (
      (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    ) {
      s = s.slice(1, -1).trim();
    }

    // убрать CRLF-артефакты
    return s.replace(/\r/g, '').replace(/\n/g, '');
  }
}
