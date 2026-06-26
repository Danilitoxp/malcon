import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import * as webpush from 'web-push';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const email = this.configService.get<string>('VAPID_EMAIL') || 'mailto:admin@malcon.com.br';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(email, publicKey, privateKey);
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled.');
    }
  }

  async saveSubscription(userId: string, subscription: any): Promise<void> {
    const supabase = this.supabaseService.getClient();
    await supabase
      .from('push_subscriptions')
      .upsert({ user_id: userId, endpoint: subscription.endpoint, subscription }, { onConflict: 'endpoint' });
  }

  async removeSubscription(endpoint: string): Promise<void> {
    await this.supabaseService.getClient()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);
  }

  async sendToAll(payload: { title: string; body: string; icon?: string; url?: string; tag?: string }): Promise<void> {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    if (!publicKey) return;

    const { data: subs } = await this.supabaseService.getClient()
      .from('push_subscriptions')
      .select('endpoint, subscription');

    if (!subs?.length) return;

    const message = JSON.stringify(payload);

    await Promise.allSettled(
      subs.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, message);
        } catch (err: any) {
          this.logger.warn(`Push failed for ${row.endpoint}: ${err.message}`);
          // Remove expired/invalid subscriptions (410 Gone)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await this.removeSubscription(row.endpoint);
          }
        }
      }),
    );
  }
}
