import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService implements OnModuleInit {
  private key: Buffer;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const rawKey = this.configService.get<string>('ENCRYPTION_KEY') || 'default_super_secret_key_crm_whatsapp_saas';
    // Hash key to ensure it is exactly 32 bytes (256 bits)
    this.key = crypto.createHash('sha256').update(rawKey).digest();
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:encryptedContent:authTag
    return `${iv.toString('hex')}:${encrypted}:${tag}`;
  }

  decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        // Fallback: If it's a plain text token (like mock seeds), return it directly.
        return encryptedText;
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const tag = Buffer.from(parts[2], 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      // Fallback: If decryption fails (e.g., encryption key changed), return the text as-is.
      return encryptedText;
    }
  }
}
