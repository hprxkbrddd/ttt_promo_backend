import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PromoService {
  constructor(private readonly supabase: SupabaseService) {}

  async takeFreeCode(usedBy?: string): Promise<string> {
    const normalizedUsedBy = usedBy?.trim() || undefined;

    try {
      // 1) Идемпотентность: уже выдавали — верни тот же код
      if (normalizedUsedBy) {
        const existing = await this.getCodeByUsedBy(normalizedUsedBy);
        if (existing) return existing;
      }

      // 2) Пытаемся забрать свободный код (с ретраями)
      for (let attempt = 0; attempt < 8; attempt++) {
        const { data: pick, error: pickError } = await this.supabase.client
          .from('promo_codes')
          .select('id')
          .eq('is_used', false)
          .limit(1)
          .maybeSingle();

        if (pickError || !pick) {
          throw new ServiceUnavailableException('No promo codes available');
        }

        const { data: updated, error: updError } = await this.supabase.client
          .from('promo_codes')
          .update({
            is_used: true,
            used_at: new Date().toISOString(),
            used_by: normalizedUsedBy ?? null,
          })
          .eq('id', pick.id)
          .eq('is_used', false)
          .select('code')
          .maybeSingle();

        // Успех
        if (updated?.code) return updated.code;

        // Ошибка/конфликт/гонка:
        // - updError может быть конфликт уникальности used_by (если есть индекс)
        // - updated==null бывает при гонке (0 строк обновилось)
        if (normalizedUsedBy) {
          const existing = await this.getCodeByUsedBy(normalizedUsedBy);
          if (existing) return existing;
        }

        // иначе просто пробуем снова (гонка/0 rows/конфликт)
        continue;
      }

      throw new ServiceUnavailableException('Promo code race condition');
    } catch (e: any) {
      // если это уже HttpException — пробросим
      if (e?.status && e?.response) throw e;

      // сетевые/SSL/DNS/битый URL до Supabase
      throw new BadGatewayException('Supabase request failed');
    }
  }

  private async getCodeByUsedBy(usedBy: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from('promo_codes')
      .select('code')
      .eq('used_by', usedBy)
      .maybeSingle();

    if (error) return null;
    return data?.code ?? null;
  }
}
