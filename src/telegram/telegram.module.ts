import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [SupabaseModule, PromoModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
