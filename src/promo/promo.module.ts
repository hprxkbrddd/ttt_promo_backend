import { Module } from '@nestjs/common';
import { PromoService } from './promo.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}
