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

  private async isEvolutionConnected(evoUrl: string, evoApiKey: string, instanceName: string): Promise<boolean> {
    try {
      const res = await axios.get(`${evoUrl}/instance/connectionState/${instanceName}`, {
        headers: { apikey: evoApiKey },
        timeout: 5000,
      });
      return res.data?.instance?.state === 'open';
    } catch {
      return false;
    }
  }

  private async autoPauseCampaign(campaignId: string, reason: string): Promise<void> {
    this.runningCampaigns.delete(campaignId);
    await this.supabaseService.getClient()
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId);
    this.logger.warn(`[Campaign ${campaignId}] AUTO-PAUSED — ${reason}`);
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

    // Resolve whatsapp_number_id for this Evolution instance (for inbox registration)
    const { data: wbNumber } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('phone_number_id', `evolution:${instanceName}`)
      .eq('active', true)
      .maybeSingle();
    const whatsappNumberId = wbNumber?.id || null;

    // Fetch pending contacts with their name for {nome} substitution
    const { data: pending } = await supabase
      .from('campaign_contacts')
      .select('id, phone, contact_id, contacts(name)')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    let consecutiveFailures = 0;
    let totalSent = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
    const CONNECTION_CHECK_EVERY = 10;

    for (const cc of pending || []) {
      if (!this.runningCampaigns.has(campaignId)) {
        this.logger.log(`Campaign ${campaignId} paused mid-run.`);
        return;
      }

      // Periodic connection check every N sends
      if (totalSent > 0 && totalSent % CONNECTION_CHECK_EVERY === 0) {
        const connected = await this.isEvolutionConnected(evoUrl, evoApiKey, instanceName);
        if (!connected) {
          await this.autoPauseCampaign(campaignId, `WhatsApp desconectado após ${totalSent} envios (possível ban)`);
          return;
        }
      }

      const contactName: string = (cc.contacts as any)?.name || '';
      const finalMessage = campaign.message.replace(/\{nome\}/gi, contactName);
      const phone = cc.phone.replace(/\D/g, '');

      try {
        const response = await axios.post(
          `${evoUrl}/message/sendText/${instanceName}`,
          { number: phone, text: finalMessage },
          { headers: { apikey: evoApiKey, 'Content-Type': 'application/json' } },
        );

        const waMessageId = response.data?.key?.id || `camp_${campaignId}_${Date.now()}`;

        await supabase
          .from('campaign_contacts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', cc.id);
        await supabase.rpc('increment_sent', { cid: campaignId });
        this.logger.log(`[Campaign ${campaignId}] Sent to ${cc.phone}`);
        consecutiveFailures = 0;
        totalSent++;

        // Register sent message in inbox (find or create conversation)
        if (whatsappNumberId && cc.contact_id) {
          try {
            let { data: conv } = await supabase
              .from('conversations')
              .select('id')
              .eq('contact_id', cc.contact_id)
              .eq('whatsapp_number_id', whatsappNumberId)
              .maybeSingle();

            let conversationId = '';
            const now = new Date().toISOString();

            if (!conv) {
              const { data: newConv } = await supabase
                .from('conversations')
                .insert({
                  contact_id: cc.contact_id,
                  whatsapp_number_id: whatsappNumberId,
                  status: 'open',
                  last_message_at: now,
                })
                .select('id')
                .single();
              conversationId = newConv?.id || '';
            } else {
              conversationId = conv.id;
              await supabase.from('conversations').update({ last_message_at: now }).eq('id', conversationId);
            }

            if (conversationId) {
              await supabase.from('messages').insert({
                conversation_id: conversationId,
                direction: 'outbound',
                content: finalMessage,
                wa_message_id: waMessageId,
                status: 'sent',
              });
            }
          } catch (inboxErr: any) {
            this.logger.warn(`[Campaign ${campaignId}] Inbox registration failed for ${cc.phone}: ${inboxErr.message}`);
          }
        }
      } catch (err: any) {
        await supabase
          .from('campaign_contacts')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', cc.id);
        await supabase.rpc('increment_failed', { cid: campaignId });
        this.logger.warn(`[Campaign ${campaignId}] Failed to ${cc.phone}: ${err.message}`);
        consecutiveFailures++;
        totalSent++;

        // After N consecutive failures, check if the number was banned
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const connected = await this.isEvolutionConnected(evoUrl, evoApiKey, instanceName);
          if (!connected) {
            await this.autoPauseCampaign(campaignId, `${consecutiveFailures} falhas consecutivas + WhatsApp desconectado (possível ban)`);
            return;
          }
          // Still connected — bad numbers streak, just reset the counter
          consecutiveFailures = 0;
        }
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
