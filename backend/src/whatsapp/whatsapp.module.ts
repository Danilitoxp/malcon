import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { CryptoService } from '../shared/crypto.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, CryptoService],
})
export class WhatsappModule {}
