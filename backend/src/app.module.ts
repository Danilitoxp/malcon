import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { CampaignModule } from './campaigns/campaign.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    WhatsappModule,
    CampaignModule,
  ],
})
export class AppModule {}
