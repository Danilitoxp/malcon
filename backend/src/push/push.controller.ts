import { Controller, Post, Delete, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { PushService } from './push.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('push')
export class PushController {
  constructor(
    private readonly pushService: PushService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await this.supabaseService.getClient().auth.getUser(token);
    if (error || !user) throw new UnauthorizedException();
    return user.id;
  }

  @Post('subscribe')
  async subscribe(
    @Body() body: { subscription: any },
    @Headers('authorization') auth: string,
  ) {
    const userId = await this.getUserId(auth);
    await this.pushService.saveSubscription(userId, body.subscription);
    return { success: true };
  }

  @Delete('unsubscribe')
  async unsubscribe(
    @Body() body: { endpoint: string },
    @Headers('authorization') auth: string,
  ) {
    await this.getUserId(auth);
    await this.pushService.removeSubscription(body.endpoint);
    return { success: true };
  }

  @Post('vapid-public-key')
  getVapidKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || '' };
  }
}
