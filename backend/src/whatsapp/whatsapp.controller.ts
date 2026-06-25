import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Query,
  Param,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  HttpException,
  UnauthorizedException
} from '@nestjs/common';
import { Request } from 'express';
import { WhatsappService } from './whatsapp.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller()
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // 1. Meta Webhook Verification (GET /api/webhooks/whatsapp)
  @Get('webhooks/whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.whatsappService.verifyWebhook(mode, token, challenge);
  }

  // 2. Incoming Meta Message webhook (POST /api/webhooks/whatsapp)
  @Post('webhooks/whatsapp')
  @HttpCode(HttpStatus.OK) // Meta expects 200 OK
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: Request,
  ): Promise<string> {
    const rawBody = (req as any).rawBody;
    
    // Validate signature
    if (rawBody && !this.whatsappService.verifySignature(signature, rawBody)) {
      throw new HttpException('Invalid signature', HttpStatus.FORBIDDEN);
    }

    // Process asynchronously (let's do fire-and-forget/immediate execution to satisfy Meta's timeout, or use a Queue)
    // Here we run it asynchronously and catch any errors to prevent blocking the HTTP response
    this.whatsappService.handleWebhookPayload(payload).catch((err) => {
      console.error('Error handling webhook payload background process:', err);
    });

    return 'EVENT_RECEIVED';
  }

  // 3. Authenticated Send Message (POST /api/messages/send)
  @Post('messages/send')
  async sendMessage(
    @Body() body: { conversationId: string; content: string },
    @Headers('authorization') authHeader: string,
  ) {
    if (!body.conversationId || !body.content) {
      throw new HttpException('Missing conversationId or content', HttpStatus.BAD_REQUEST);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    // Authenticate user against Supabase Auth using the provided JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    // Pass the sender ID (Supabase Auth UID) to associate with the sent message
    return this.whatsappService.sendMessage(body.conversationId, body.content, user.id);
  }

  // 4. Authenticated Register WhatsApp Number (POST /api/whatsapp-numbers)
  @Post('whatsapp-numbers')
  async registerNumber(
    @Body() body: { name: string; phoneNumberId: string; phoneNumber: string; accessToken: string; wabaId?: string },
    @Headers('authorization') authHeader: string,
  ) {
    if (!body.name || !body.phoneNumberId || !body.phoneNumber || !body.accessToken) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    // Authenticate user against Supabase Auth using the provided JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    // Check role in profiles to see if the user is authorized
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new HttpException('Only administrators can register WhatsApp Business numbers', HttpStatus.FORBIDDEN);
    }

    return this.whatsappService.registerWhatsappNumber(body);
  }

  // 5. Get Evolution API Connection Status (GET /api/whatsapp/evolution/status)
  @Get('whatsapp/evolution/status')
  async getEvolutionStatus(
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    return this.whatsappService.getEvolutionStatus();
  }

  // 6. Trigger Evolution API Synchronization (POST /api/whatsapp/evolution/sync)
  @Post('whatsapp/evolution/sync')
  async syncEvolution(
    @Body() body: { webhookUrl?: string },
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    // Check role in profiles to see if the user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new HttpException('Only administrators can trigger Evolution API synchronization', HttpStatus.FORBIDDEN);
    }

    return this.whatsappService.syncEvolution(body.webhookUrl);
  }

  // 7. Update conversation assigned agent (PATCH /api/conversations/:id/assign)
  @Patch('conversations/:id/assign')
  async assignConversation(
    @Param('id') id: string,
    @Body() body: { assignedUserId: string | null },
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException();

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ assigned_user_id: body.assignedUserId ?? null })
      .eq('id', id);

    if (updateError) throw new HttpException(updateError.message, HttpStatus.BAD_REQUEST);
    return { success: true };
  }

  // 8. Update conversation status (PATCH /api/conversations/:id/status)
  @Patch('conversations/:id/status')
  async updateConversationStatus(
    @Param('id') id: string,
    @Body() body: { status: 'open' | 'closed' },
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException();

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ status: body.status })
      .eq('id', id);

    if (updateError) throw new HttpException(updateError.message, HttpStatus.BAD_REQUEST);
    return { success: true };
  }

  // 9. Evolution API Webhook Endpoint (POST /api/webhooks/evolution)
  @Post('webhooks/evolution')
  @HttpCode(HttpStatus.OK)
  async handleEvolutionWebhook(@Body() payload: any): Promise<string> {
    this.whatsappService.handleEvolutionWebhookPayload(payload).catch((err) => {
      console.error('Error handling Evolution webhook payload:', err);
    });
    return 'EVENT_RECEIVED';
  }

  // 8. Get Evolution API Connection QR Code (GET /api/whatsapp/evolution/connect)
  @Get('whatsapp/evolution/connect')
  async getEvolutionConnect(
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    return this.whatsappService.getEvolutionConnectQR();
  }

  // 9. Setup Evolution API instance before QR (POST /api/whatsapp/evolution/setup)
  @Post('whatsapp/evolution/setup')
  async setupEvolution(
    @Body() body: { webhookUrl?: string },
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('Invalid Supabase access token');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      throw new HttpException('Only administrators can setup the Evolution API instance', HttpStatus.FORBIDDEN);
    }
    return this.whatsappService.setupEvolution(body.webhookUrl);
  }

  // 10. Logout Evolution API instance (DELETE /api/whatsapp/evolution/logout)
  @Delete('whatsapp/evolution/logout')
  async logoutEvolution(
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new HttpException('Only administrators can disconnect the Evolution API instance', HttpStatus.FORBIDDEN);
    }

    return this.whatsappService.logoutEvolution();
  }
}
