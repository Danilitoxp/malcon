import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { CryptoService } from '../shared/crypto.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, CryptoService],
})
export class WhatsappModule {}
