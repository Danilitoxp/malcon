import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import axios from 'axios';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  private runningCampaigns = new Set<string>();

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {}

  async previewContacts(filters: { types?: string[]; states?: string[] }): Promise<number> {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
      .not('phone', 'like', 'lid:%');
    if (filters.types?.length) query = query.in('type', filters.types);
    if (filters.states?.length) query = query.in('state', filters.states);
    const { count } = await query;
    return count || 0;
  }

  async createCampaign(data: {
    name: string;
    message: string;
    delaySeconds: number;
    filters: { types?: string[]; states?: string[] };
  }): Promise<any> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('contacts')
      .select('id, phone')
      .not('phone', 'is', null)
      .not('phone', 'like', 'lid:%');
    if (data.filters.types?.length) query = query.in('type', data.filters.types);
    if (data.filters.states?.length) query = query.in('state', data.filters.states);

    const { data: contacts, error } = await query;
    if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    if (!contacts?.length) throw new HttpException('Nenhum contato encontrado com os filtros selecionados.', HttpStatus.BAD_REQUEST);

    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .insert({
        name: data.name,
        message: data.message,
        delay_seconds: data.delaySeconds,
        total_contacts: contacts.length,
      })
      .select()
      .single();
    if (campErr) throw new HttpException(campErr.message, HttpStatus.INTERNAL_SERVER_ERROR);

    const { error: ccErr } = await supabase.from('campaign_contacts').insert(
      contacts.map((c: any) => ({
        campaign_id: campaign.id,
        contact_id: c.id,
        phone: c.phone,
      })),
    );
    if (ccErr) throw new HttpException(ccErr.message, HttpStatus.INTERNAL_SERVER_ERROR);

    return campaign;
  }

  async startCampaign(id: string): Promise<any> {
    const supabase = this.supabaseService.getClient();
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).single();
    if (!campaign) throw new HttpException('Campanha não encontrada.', HttpStatus.NOT_FOUND);
    if (campaign.status === 'running') throw new HttpException('Campanha já em execução.', HttpStatus.BAD_REQUEST);
    if (campaign.status === 'completed') throw new HttpException('Campanha já concluída.', HttpStatus.BAD_REQUEST);

    await supabase
      .from('campaigns')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', id);

    this.runCampaignLoop(id).catch((err) =>
      this.logger.error(`Campaign ${id} error: ${err.message}`),
    );
    return { success: true };
  }

  async pauseCampaign(id: string): Promise<any> {
    await this.supabaseService.getClient().from('campaigns').update({ status: 'paused' }).eq('id', id);
    this.runningCampaigns.delete(id);
    return { success: true };
  }

  private async runCampaignLoop(campaignId: string): Promise<void> {
    this.runningCampaigns.add(campaignId);
    const supabase = this.supabaseService.getClient();
    const evoUrl = this.configService.get<string>('EVO_URL');
    const evoApiKey = this.configService.get<string>('EVO_API_KEY');
    const instanceName = this.configService.get<string>('EVO_INSTANCE');

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('message, delay_seconds')
      .eq('id', campaignId)
      .single();

    const { data: pending } = await supabase
      .from('campaign_contacts')
      .select('id, phone')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    for (const cc of pending || []) {
      if (!this.runningCampaigns.has(campaignId)) {
        this.logger.log(`Campaign ${campaignId} paused mid-run.`);
        return;
      }

      try {
        const phone = cc.phone.replace(/\D/g, '');
        await axios.post(
          `${evoUrl}/message/sendText/${instanceName}`,
          { number: phone, text: campaign.message },
          { headers: { apikey: evoApiKey, 'Content-Type': 'application/json' } },
        );
        await supabase
          .from('campaign_contacts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', cc.id);
        await supabase.rpc('increment_sent', { cid: campaignId });
        this.logger.log(`[Campaign ${campaignId}] Sent to ${cc.phone}`);
      } catch (err: any) {
        await supabase
          .from('campaign_contacts')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', cc.id);
        await supabase.rpc('increment_failed', { cid: campaignId });
        this.logger.warn(`[Campaign ${campaignId}] Failed to ${cc.phone}: ${err.message}`);
      }

      // Random jitter ±30% to appear more human
      const baseDelay = (campaign.delay_seconds || 10) * 1000;
      const jitter = baseDelay * (Math.random() * 0.3);
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }

    await supabase
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);
    this.runningCampaigns.delete(campaignId);
    this.logger.log(`Campaign ${campaignId} completed.`);
  }

  async updateCampaign(id: string, data: { name?: string; message?: string; delaySeconds?: number }): Promise<any> {
    const supabase = this.supabaseService.getClient();
    const { data: campaign } = await supabase.from('campaigns').select('status').eq('id', id).single();
    if (!campaign) throw new HttpException('Campanha não encontrada.', HttpStatus.NOT_FOUND);
    if (campaign.status !== 'draft') throw new HttpException('Só é possível editar campanhas em rascunho.', HttpStatus.BAD_REQUEST);

    const updates: any = {};
    if (data.name) updates.name = data.name;
    if (data.message) updates.message = data.message;
    if (data.delaySeconds) updates.delay_seconds = data.delaySeconds;

    const { data: updated, error } = await supabase.from('campaigns').update(updates).eq('id', id).select().single();
    if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    return updated;
  }

  async deleteCampaign(id: string): Promise<any> {
    const supabase = this.supabaseService.getClient();
    const { data: campaign } = await supabase.from('campaigns').select('status').eq('id', id).single();
    if (!campaign) throw new HttpException('Campanha não encontrada.', HttpStatus.NOT_FOUND);
    if (campaign.status === 'running') throw new HttpException('Não é possível excluir uma campanha em execução. Pause-a primeiro.', HttpStatus.BAD_REQUEST);

    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    return { success: true };
  }

  async listCampaigns(): Promise<any[]> {
    const { data } = await this.supabaseService
      .getClient()
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  }

  async getCampaign(id: string): Promise<any> {
    const { data } = await this.supabaseService
      .getClient()
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();
    return data;
  }
}
