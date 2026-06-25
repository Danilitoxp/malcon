import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Headers,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('campaigns')
export class CampaignController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async requireAuth(authHeader: string) {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await this.supabaseService.getClient().auth.getUser(token);
    if (error || !user) throw new UnauthorizedException();
    return user;
  }

  private async requireAdmin(authHeader: string) {
    const user = await this.requireAuth(authHeader);
    const { data: profile } = await this.supabaseService
      .getClient()
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      throw new HttpException('Apenas administradores podem gerenciar campanhas.', HttpStatus.FORBIDDEN);
    }
    return user;
  }

  @Get()
  async list(@Headers('authorization') auth: string) {
    await this.requireAuth(auth);
    return this.campaignService.listCampaigns();
  }

  @Post('preview')
  async preview(
    @Body() body: { filters?: { types?: string[]; states?: string[] } },
    @Headers('authorization') auth: string,
  ) {
    await this.requireAdmin(auth);
    return { count: await this.campaignService.previewContacts(body.filters || {}) };
  }

  @Post()
  async create(
    @Body() body: { name: string; message: string; delaySeconds: number; filters: any },
    @Headers('authorization') auth: string,
  ) {
    await this.requireAdmin(auth);
    if (!body.name || !body.message) {
      throw new HttpException('Nome e mensagem são obrigatórios.', HttpStatus.BAD_REQUEST);
    }
    return this.campaignService.createCampaign({
      name: body.name,
      message: body.message,
      delaySeconds: body.delaySeconds || 10,
      filters: body.filters || {},
    });
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Headers('authorization') auth: string) {
    await this.requireAuth(auth);
    return this.campaignService.getCampaign(id);
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @Headers('authorization') auth: string) {
    await this.requireAdmin(auth);
    return this.campaignService.startCampaign(id);
  }

  @Patch(':id/pause')
  async pause(@Param('id') id: string, @Headers('authorization') auth: string) {
    await this.requireAdmin(auth);
    return this.campaignService.pauseCampaign(id);
  }
}
