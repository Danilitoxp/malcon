import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CryptoService } from '../shared/crypto.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private cryptoService: CryptoService,
  ) {}

  // 1. Verify Meta Webhook Challenge (GET /webhooks/whatsapp)
  verifyWebhook(mode: string, token: string, challenge: string): string {
    const localVerifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') || 'crm_verify_token_default';

    if (mode === 'subscribe' && token === localVerifyToken) {
      this.logger.log('Webhook verified successfully!');
      return challenge;
    } else {
      this.logger.warn('Failed webhook verification attempt.');
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  // 2. Verify X-Hub-Signature-256 (for security against third-party injection)
  verifySignature(signatureHeader: string, rawBody: Buffer): boolean {
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      this.logger.warn('WHATSAPP_APP_SECRET not configured. Skipping signature validation.');
      return true; // Skip if app secret is not defined in env, but warn
    }

    if (!signatureHeader) {
      return false;
    }

    const signature = signatureHeader.replace('sha256=', '');
    const hmac = crypto.createHmac('sha256', appSecret);
    const digest = hmac.update(rawBody).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(digest, 'utf8'));
  }

  // 3. Process incoming Meta Webhook payload (POST /webhooks/whatsapp)
  async handleWebhookPayload(payload: any): Promise<void> {
    this.logger.debug(`Received WhatsApp webhook payload: ${JSON.stringify(payload)}`);

    if (payload.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value || change.field !== 'messages') continue;

        // Process message status updates (sent, delivered, read, failed)
        if (value.statuses && value.statuses.length > 0) {
          await this.handleMessageStatuses(value.statuses);
        }

        // Process new incoming messages
        if (value.messages && value.messages.length > 0) {
          await this.handleIncomingMessages(value.metadata, value.contacts, value.messages);
        }
      }
    }
  }

  // Handle incoming status updates
  private async handleMessageStatuses(statuses: any[]): Promise<void> {
    const supabase = this.supabaseService.getClient();

    for (const statusObj of statuses) {
      const waMessageId = statusObj.id;
      const status = statusObj.status; // delivered, read, failed, sent

      this.logger.log(`Updating status for message ${waMessageId} to ${status}`);

      const { error } = await supabase
        .from('messages')
        .update({ status })
        .eq('wa_message_id', waMessageId);

      if (error) {
        this.logger.error(`Error updating message status: ${error.message}`);
      }
    }
  }

  // Handle incoming messages
  private async handleIncomingMessages(metadata: any, contacts: any[], messages: any[]): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const phoneId = metadata.phone_number_id;

    // Fetch the WhatsApp number config from the database
    const { data: whatsappNumber, error: wabaError } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('phone_number_id', phoneId)
      .eq('active', true)
      .single();

    if (wabaError || !whatsappNumber) {
      this.logger.error(`WABA Phone ID ${phoneId} is not configured or active in this system. Skipping message.`);
      return;
    }

    for (const message of messages) {
      const fromPhoneRaw = message.from; // e.g. "5511999999999"
      const waMessageId = message.id;
      const messageTime = new Date(parseInt(message.timestamp) * 1000).toISOString();
      let content = '';

      if (message.type === 'text') {
        content = message.text?.body || '';
      } else if (message.type === 'button') {
        content = message.button?.text || '[Botão clicado]';
      } else if (message.type === 'interactive') {
        const interactiveType = message.interactive?.type;
        if (interactiveType === 'button_reply') {
          content = message.interactive?.button_reply?.title || '[Resposta interativa]';
        } else if (interactiveType === 'list_reply') {
          content = message.interactive?.list_reply?.title || '[Lista interativa]';
        } else {
          content = '[Mensagem interativa]';
        }
      } else {
        content = `[Mensagem do tipo: ${message.type}]`;
      }

      // Format E.164 number
      const phoneFormatted = fromPhoneRaw.startsWith('+') ? fromPhoneRaw : `+${fromPhoneRaw}`;

      // Extract DDD, City, State for Brazil
      let ddd = '99';
      let state = 'UF';
      let city = 'Cidade';

      if (fromPhoneRaw.startsWith('55') && fromPhoneRaw.length >= 4) {
        ddd = fromPhoneRaw.substring(2, 4);
        // Simple mapping for demonstration
        const dddMapping: Record<string, { state: string; city: string }> = {
          '11': { state: 'SP', city: 'São Paulo' },
          '12': { state: 'SP', city: 'São José dos Campos' },
          '13': { state: 'SP', city: 'Santos' },
          '19': { state: 'SP', city: 'Campinas' },
          '21': { state: 'RJ', city: 'Rio de Janeiro' },
          '31': { state: 'MG', city: 'Belo Horizonte' },
          '41': { state: 'PR', city: 'Curitiba' },
          '51': { state: 'RS', city: 'Porto Alegre' },
          '61': { state: 'DF', city: 'Brasília' },
          '71': { state: 'BA', city: 'Salvador' },
          '81': { state: 'PE', city: 'Recife' },
          '85': { state: 'CE', city: 'Fortaleza' },
          '91': { state: 'PA', city: 'Belém' },
        };
        if (dddMapping[ddd]) {
          state = dddMapping[ddd].state;
          city = dddMapping[ddd].city;
        }
      }

      // Find contact's profile name sent by Meta
      const contactProfile = contacts.find((c) => c.wa_id === fromPhoneRaw);
      const contactName = contactProfile?.profile?.name || 'Contato WhatsApp';

      // 1. Get or Create Contact
      let { data: dbContact, error: contactError } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', phoneFormatted)
        .maybeSingle();

      if (contactError) {
        this.logger.error(`Error searching contact: ${contactError.message}`);
        continue;
      }

      if (!dbContact) {
        // Create new contact
        const { data: newContact, error: createContactError } = await supabase
          .from('contacts')
          .insert({
            name: contactName,
            phone: phoneFormatted,
            ddd,
            city,
            state,
            region: 'Sudeste', // Default region
            type: 'ELEITOR',
          })
          .select('id')
          .single();

        if (createContactError) {
          this.logger.error(`Error creating contact: ${createContactError.message}`);
          continue;
        }
        dbContact = newContact;
      }

      // 2. Get or Create Conversation
      let { data: dbConversation, error: convError } = await supabase
        .from('conversations')
        .select('id, status')
        .eq('contact_id', dbContact.id)
        .eq('whatsapp_number_id', whatsappNumber.id)
        .maybeSingle();

      if (convError) {
        this.logger.error(`Error searching conversation: ${convError.message}`);
        continue;
      }

      let conversationId = '';

      if (!dbConversation) {
        // Create new conversation
        const { data: newConv, error: createConvError } = await supabase
          .from('conversations')
          .insert({
            contact_id: dbContact.id,
            whatsapp_number_id: whatsappNumber.id,
            status: 'open',
            last_message_at: messageTime,
          })
          .select('id')
          .single();

        if (createConvError) {
          this.logger.error(`Error creating conversation: ${createConvError.message}`);
          continue;
        }
        conversationId = newConv.id;
      } else {
        conversationId = dbConversation.id;
        // Reopen conversation and update last_message_at
        await supabase
          .from('conversations')
          .update({
            status: 'open',
            last_message_at: messageTime,
          })
          .eq('id', conversationId);
      }

      // 3. Insert Message
      const { error: msgInsertError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          direction: 'inbound',
          content,
          wa_message_id: waMessageId,
          status: 'read',
          created_at: messageTime,
        });

      if (msgInsertError) {
        this.logger.error(`Error inserting message: ${msgInsertError.message}`);
      }
    }
  }

  // 4. Send Message via Meta Cloud API or Evolution API (called by agents from CRM frontend)
  async sendMessage(conversationId: string, content: string, senderId?: string): Promise<any> {
    const supabase = this.supabaseService.getClient();

    // Fetch conversation details including contact and WABA details
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        contacts ( phone ),
        whatsapp_numbers ( phone_number_id, access_token )
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    const contactPhone = (conversation.contacts as any)?.phone;
    const phoneId = (conversation.whatsapp_numbers as any)?.phone_number_id;
    const encryptedToken = (conversation.whatsapp_numbers as any)?.access_token;

    if (!contactPhone || !phoneId || !encryptedToken) {
      throw new HttpException('Conversation is missing WhatsApp configuration details', HttpStatus.BAD_REQUEST);
    }

    // Check if this is an Evolution API channel
    const isEvolution = phoneId.startsWith('evolution:');

    if (isEvolution) {
      const instanceName = phoneId.replace('evolution:', '');
      const evoUrl = this.configService.get<string>('EVO_URL') || 'http://localhost:8080';
      
      let decryptedToken = '';
      try {
        decryptedToken = this.cryptoService.decrypt(encryptedToken);
      } catch (e) {
        decryptedToken = this.configService.get<string>('EVO_API_KEY') || '';
      }

      const cleanPhone = contactPhone.replace('+', '');

      try {
        this.logger.log(`Sending message to ${cleanPhone} via Evolution API Instance ${instanceName}`);
        
        const response = await axios.post(
          `${evoUrl}/message/sendText/${instanceName}`,
          {
            number: cleanPhone,
            text: content,
          },
          {
            headers: {
              apikey: decryptedToken,
              'Content-Type': 'application/json',
            },
          },
        );

        const waMessageId = response.data?.key?.id || `evo_ref_${Date.now()}`;

        // Log sent message in DB
        const { data: insertedMsg, error: insertError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            direction: 'outbound',
            content,
            wa_message_id: waMessageId,
            status: 'sent',
            sender_id: senderId || null,
          })
          .select()
          .single();

        if (insertError) {
          this.logger.error(`Failed to register sent message in DB: ${insertError.message}`);
        }

        // Update conversation last message timestamp
        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conversationId);

        return {
          success: true,
          message: insertedMsg,
          evoResponse: response.data,
        };
      } catch (error) {
        const errorMsg = error.response?.data || error.message;
        this.logger.error(`Error sending message via Evolution API: ${JSON.stringify(errorMsg)}`);
        throw new HttpException(
          {
            message: 'Error response from Evolution API',
            details: errorMsg,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    // Decrypt access token for Meta Cloud API
    const decryptedToken = this.cryptoService.decrypt(encryptedToken);

    // Standardize phone for Meta (strip '+' sign, Meta API prefers raw numbers e.g. 5511999999999)
    const metaToNumber = contactPhone.replace('+', '');

    try {
      this.logger.log(`Sending message to ${metaToNumber} via WABA Phone ID ${phoneId}`);
      
      const metaUrl = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
      
      const response = await axios.post(
        metaUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: metaToNumber,
          type: 'text',
          text: {
            preview_url: false,
            body: content,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${decryptedToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const waMessageId = response.data?.messages?.[0]?.id;

      // Log sent message in DB
      const { data: insertedMsg, error: insertError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          content,
          wa_message_id: waMessageId || `local_ref_${Date.now()}`,
          status: 'sent',
          sender_id: senderId || null,
        })
        .select()
        .single();

      if (insertError) {
        this.logger.error(`Failed to register sent message in DB: ${insertError.message}`);
      }

      // Update conversation last message timestamp
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      return {
        success: true,
        message: insertedMsg,
        metaResponse: response.data,
      };
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      this.logger.error(`Error sending message via Meta API: ${JSON.stringify(errorMsg)}`);
      throw new HttpException(
        {
          message: 'Error response from Meta Cloud API',
          details: errorMsg,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 5. Register new WhatsApp Business Number (Admin utility)
  async registerWhatsappNumber(data: {
    name: string;
    phoneNumberId: string;
    phoneNumber: string;
    accessToken: string;
    wabaId?: string;
  }): Promise<any> {
    const supabase = this.supabaseService.getClient();
    const encryptedToken = this.cryptoService.encrypt(data.accessToken);

    const { data: newNumber, error } = await supabase
      .from('whatsapp_numbers')
      .insert({
        name: data.name,
        phone_number_id: data.phoneNumberId,
        phone_number: data.phoneNumber,
        access_token: encryptedToken,
        waba_id: data.wabaId || null,
        active: true,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to register WhatsApp number: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    return newNumber;
  }

  private evoStatusCache: { data: any; expiresAt: number } | null = null;

  // 6. Get Evolution API status
  async getEvolutionStatus(): Promise<any> {
    if (this.evoStatusCache && Date.now() < this.evoStatusCache.expiresAt) {
      return this.evoStatusCache.data;
    }

    const evoUrl = this.configService.get<string>('EVO_URL');
    const evoApiKey = this.configService.get<string>('EVO_API_KEY');
    const instanceName = this.configService.get<string>('EVO_INSTANCE');

    if (!evoUrl || !evoApiKey || !instanceName) {
      return {
        configured: false,
        status: 'disconnected',
        message: 'Credenciais da Evolution API não configuradas no arquivo .env.',
      };
    }

    try {
      this.logger.log(`Checking Evolution API status for instance ${instanceName}`);
      const response = await axios.get(
        `${evoUrl}/instance/connectionState/${instanceName}`,
        {
          headers: {
            apikey: evoApiKey,
          },
        },
      );

      const state = response.data?.instance?.state || 'unknown';

      // Fetch owner number from instances list
      let owner = '';
      let profileName = '';
      let profilePicUrl = '';
      try {
        const instancesRes = await axios.get(
          `${evoUrl}/instance/fetchInstances`,
          {
            headers: {
              apikey: evoApiKey,
            },
          },
        );
        // fetchInstances returns an array directly or wrapped in { value: [...] }
        const rawList = instancesRes.data;
        const list = Array.isArray(rawList)
          ? rawList
          : Array.isArray(rawList?.value)
          ? rawList.value
          : [];
        // Field is `name`, not `instanceName`; owner is top-level `ownerJid`
        const currentInst = list.find(
          (inst: any) => inst.name === instanceName || inst.instanceName === instanceName,
        );
        if (currentInst) {
          // ownerJid format: "5511999999999@s.whatsapp.net" — strip the suffix
          const rawJid = currentInst.ownerJid || currentInst.instance?.owner || '';
          owner = rawJid.split('@')[0] ? `+${rawJid.split('@')[0]}` : '';
          profileName = currentInst.profileName || currentInst.instance?.profileName || '';
          profilePicUrl = currentInst.profilePicUrl || '';
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch instance details: ${err.message}`);
      }

      const result = {
        configured: true,
        instanceName,
        status: state === 'open' ? 'connected' : 'disconnected',
        owner,
        profileName,
        profilePicUrl,
        url: evoUrl,
      };
      this.evoStatusCache = { data: result, expiresAt: Date.now() + 20000 };
      return result;
    } catch (error) {
      this.logger.error(`Error connecting to Evolution API: ${error.message}`);
      return {
        configured: true,
        instanceName,
        status: 'disconnected',
        message: error.message,
        url: evoUrl,
      };
    }
  }

  // 7. Sync chats, contacts, and messages from Evolution API
  async syncEvolution(webhookUrl?: string): Promise<any> {
    const evoUrl = this.configService.get<string>('EVO_URL');
    const evoApiKey = this.configService.get<string>('EVO_API_KEY');
    const instanceName = this.configService.get<string>('EVO_INSTANCE');
    const appUrl = this.configService.get<string>('APP_URL') || '';
    const finalWebhookUrl = webhookUrl || (appUrl ? `${appUrl}/api/webhooks/evolution` : '');

    if (!evoUrl || !evoApiKey || !instanceName) {
      throw new HttpException('Credenciais da Evolution API não configuradas no arquivo .env.', HttpStatus.BAD_REQUEST);
    }

    const status = await this.getEvolutionStatus();
    if (status.status !== 'connected') {
      throw new HttpException('A instância da Evolution API não está conectada (o estado não é open). Conecte a instância primeiro.', HttpStatus.BAD_REQUEST);
    }

    const supabase = this.supabaseService.getClient();

    const phoneId = `evolution:${instanceName}`;
    const encryptedToken = this.cryptoService.encrypt(evoApiKey);
    const rawPhone = status.owner ? status.owner.replace(/\D/g, '') : '00000000000';
    const phoneFormatted = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

    const { data: existingWaba } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('phone_number_id', phoneId)
      .maybeSingle();

    let whatsappNumberId = '';
    if (existingWaba) {
      whatsappNumberId = existingWaba.id;
      await supabase
        .from('whatsapp_numbers')
        .update({
          name: `Evolution - ${status.profileName || instanceName}`,
          phone_number: phoneFormatted,
          access_token: encryptedToken,
          active: true,
        })
        .eq('id', whatsappNumberId);
    } else {
      const { data: newWaba, error: insertError } = await supabase
        .from('whatsapp_numbers')
        .insert({
          name: `Evolution - ${status.profileName || instanceName}`,
          phone_number_id: phoneId,
          phone_number: phoneFormatted,
          access_token: encryptedToken,
          waba_id: 'evolution',
          active: true,
        })
        .select('id')
        .single();

      if (insertError) {
        throw new HttpException(`Falha ao registrar canal de WhatsApp no banco: ${insertError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      whatsappNumberId = newWaba.id;
    }

    // Configure Webhook programmatically in Evolution API
    if (finalWebhookUrl) {
      try {
        this.logger.log(`Configuring Evolution webhook for ${instanceName} to ${finalWebhookUrl}`);
        await axios.post(
          `${evoUrl}/webhook/set/${instanceName}`,
          {
            webhook: {
              enabled: true,
              url: finalWebhookUrl,
              webhookByEvents: false,
              events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
              ],
            },
          },
          {
            headers: {
              apikey: evoApiKey,
              'Content-Type': 'application/json',
            },
          },
        );
      } catch (err) {
        this.logger.warn(`Failed to set Evolution webhook automatically: ${err.message}`);
      }
    }

    this.logger.log(`[Sync] Channel registered. New conversations and messages will arrive via webhook.`);

    return {
      success: true,
      whatsappNumberId,
    };
  }

  private async fetchAndSaveProfilePic(contactId: string, phone: string, instanceName: string): Promise<void> {
    const evoUrl = this.configService.get<string>('EVO_URL') || '';
    const evoApiKey = this.configService.get<string>('EVO_API_KEY') || '';
    try {
      const res = await axios.post(
        `${evoUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
        { number: phone.replace('+', '') },
        { headers: { apikey: evoApiKey, 'Content-Type': 'application/json' } },
      );
      const url = res.data?.profilePictureUrl || res.data?.picture || '';
      if (url) {
        const supabase = this.supabaseService.getClient();
        await supabase.from('contacts').update({ profile_pic_url: url }).eq('id', contactId);
      }
    } catch {
      // silently ignore — profile pic is optional
    }
  }

  // 8. Process incoming Evolution API payload
  async handleEvolutionWebhookPayload(payload: any): Promise<void> {
    this.logger.debug(`Received Evolution API webhook payload: ${JSON.stringify(payload)}`);

    const event = payload.event;
    const instanceName = payload.instance;

    if (!instanceName || !['messages.upsert', 'messages.update'].includes(event)) {
      return;
    }

    const supabase = this.supabaseService.getClient();

    // Handle status updates — only promote, never regress
    if (event === 'messages.update') {
      const d = payload.data;
      const waMessageId = d?.keyId;
      const rawStatus: string = d?.status || '';
      const statusMap: Record<string, string> = {
        DELIVERY_ACK: 'delivered',
        READ: 'read',
        PLAYED: 'read',
      };
      const status = statusMap[rawStatus];
      // PENDING and SERVER_ACK are skipped — message is already 'sent' by default
      if (waMessageId && status) {
        const priority: Record<string, number> = { sent: 0, delivered: 1, read: 2 };
        const newPriority = priority[status];
        const lowerStatuses = Object.keys(priority).filter(s => priority[s] < newPriority);
        await supabase.from('messages')
          .update({ status })
          .eq('wa_message_id', waMessageId)
          .in('status', lowerStatuses);
      }
      return;
    }

    const phoneId = `evolution:${instanceName}`;
    const { data: whatsappNumber, error: wabaError } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('phone_number_id', phoneId)
      .eq('active', true)
      .single();

    if (wabaError || !whatsappNumber) {
      this.logger.error(`Evolution instance ${instanceName} is not configured or active in this system. Skipping webhook.`);
      return;
    }

    const messageData = payload.data;
    if (!messageData || !messageData.key) return;

    const jid = messageData.key.remoteJid;
    const isRegularJid = jid && jid.endsWith('@s.whatsapp.net');
    const isLidJid = jid && jid.endsWith('@lid');

    if (!isRegularJid && !isLidJid) {
      return;
    }

    const waMessageId = messageData.key.id;
    const fromMe = messageData.key.fromMe || false;
    const messageType: string = messageData.messageType || '';

    // Skip outbound messages — backend already inserts them when sending
    if (fromMe) return;

    // Skip encrypted edit notifications — content is not decryptable
    if (messageType === 'secretEncryptedMessage') return;

    // For @lid JIDs, try to resolve the real phone number from participant field or use LID as identifier
    let phoneNo = '';
    let contactPhoneFormatted = '';

    if (isRegularJid) {
      phoneNo = jid.split('@')[0];
      contactPhoneFormatted = `+${phoneNo}`;
    } else {
      // @lid: try participant field (sometimes present), else use LID as a unique identifier
      const participant = messageData.participant || messageData.key.participant || '';
      if (participant && participant.endsWith('@s.whatsapp.net')) {
        phoneNo = participant.split('@')[0];
        contactPhoneFormatted = `+${phoneNo}`;
      } else {
        // Use the LID itself as a stable identifier prefixed to distinguish from phone numbers
        phoneNo = jid.split('@')[0];
        contactPhoneFormatted = `lid:${phoneNo}`;
      }
    }

    // Get or Create Contact
    let { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', contactPhoneFormatted)
      .maybeSingle();

    if (!contact) {
      let ddd = '99';
      let state = 'UF';
      let city = 'Cidade';

      if (phoneNo.startsWith('55') && phoneNo.length >= 4) {
        ddd = phoneNo.substring(2, 4);
        const dddMapping: Record<string, { state: string; city: string }> = {
          '11': { state: 'SP', city: 'São Paulo' },
          '12': { state: 'SP', city: 'São José dos Campos' },
          '13': { state: 'SP', city: 'Santos' },
          '19': { state: 'SP', city: 'Campinas' },
          '21': { state: 'RJ', city: 'Rio de Janeiro' },
          '31': { state: 'MG', city: 'Belo Horizonte' },
          '41': { state: 'PR', city: 'Curitiba' },
          '51': { state: 'RS', city: 'Porto Alegre' },
          '61': { state: 'DF', city: 'Brasília' },
          '71': { state: 'BA', city: 'Salvador' },
          '81': { state: 'PE', city: 'Recife' },
          '85': { state: 'CE', city: 'Fortaleza' },
          '91': { state: 'PA', city: 'Belém' },
        };
        if (dddMapping[ddd]) {
          state = dddMapping[ddd].state;
          city = dddMapping[ddd].city;
        }
      }

      const contactName = messageData.pushName || `Contato ${contactPhoneFormatted}`;

      const { data: newContact, error: createContactError } = await supabase
        .from('contacts')
        .insert({
          name: contactName,
          phone: contactPhoneFormatted,
          ddd,
          city,
          state,
          region: 'Sudeste',
          type: 'ELEITOR',
        })
        .select('id')
        .single();

      if (createContactError) {
        this.logger.error(`Error creating contact from webhook: ${createContactError.message}`);
        return;
      }
      contact = newContact;

      // Fetch profile pic asynchronously — does not block webhook processing
      if (isRegularJid) {
        this.fetchAndSaveProfilePic(contact.id, contactPhoneFormatted, instanceName);
      }
    }

    // Get or Create Conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact.id)
      .eq('whatsapp_number_id', whatsappNumber.id)
      .maybeSingle();

    let conversationId = '';
    const messageTime = messageData.messageTimestamp
      ? new Date(messageData.messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

    if (!conversation) {
      const { data: newConv, error: createConvError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contact.id,
          whatsapp_number_id: whatsappNumber.id,
          status: 'open',
          last_message_at: messageTime,
        })
        .select('id')
        .single();

      if (createConvError) {
        this.logger.error(`Error creating conversation from webhook: ${createConvError.message}`);
        return;
      }
      conversationId = newConv.id;
    } else {
      conversationId = conversation.id;
      await supabase
        .from('conversations')
        .update({
          status: 'open',
          last_message_at: messageTime,
        })
        .eq('id', conversationId);
    }

    // Extract content
    let content = '';
    if (messageData.message) {
      if (typeof messageData.message === 'string') {
        content = messageData.message;
      } else if (messageData.message.conversation) {
        content = messageData.message.conversation;
      } else if (messageData.message.extendedTextMessage?.text) {
        content = messageData.message.extendedTextMessage.text;
      } else if (messageData.message.imageMessage?.caption) {
        content = messageData.message.imageMessage.caption;
      } else if (messageData.message.videoMessage?.caption) {
        content = messageData.message.videoMessage.caption;
      } else {
        content = `[Mensagem: ${messageData.messageType || 'Mídia'}]`;
      }
    } else {
      content = '[Mensagem vazia ou sem texto]';
    }

    // Insert Message
    const { error: msgInsertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        direction: fromMe ? 'outbound' : 'inbound',
        content,
        wa_message_id: waMessageId,
        status: fromMe ? 'sent' : 'read',
        created_at: messageTime,
      });

    if (msgInsertError) {
      this.logger.error(`Error inserting webhook message: ${msgInsertError.message}`);
    }
  }

  // 9. Get Evolution API connect QR Code
  async getEvolutionConnectQR(): Promise<any> {
    const evoUrl = this.configService.get<string>('EVO_URL');
    const evoApiKey = this.configService.get<string>('EVO_API_KEY');
    const instanceName = this.configService.get<string>('EVO_INSTANCE');

    if (!evoUrl || !evoApiKey || !instanceName) {
      throw new HttpException('Credenciais da Evolution API não configuradas no arquivo .env.', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`Fetching connect QR code for instance ${instanceName}`);
      const response = await axios.get(
        `${evoUrl}/instance/connect/${instanceName}`,
        {
          headers: {
            apikey: evoApiKey,
          },
        },
      );
      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      this.logger.error(`Error fetching QR code from Evolution API: ${JSON.stringify(errorMsg)}`);
      throw new HttpException(
        {
          message: 'Falha ao recuperar o QR Code de conexão',
          details: errorMsg,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 10. Setup Evolution API instance (create if needed + webhook + settings)
  async setupEvolution(webhookUrl?: string): Promise<any> {
    const evoUrl = this.configService.get<string>('EVO_URL');
    const evoApiKey = this.configService.get<string>('EVO_API_KEY');
    const instanceName = this.configService.get<string>('EVO_INSTANCE');
    const appUrl = this.configService.get<string>('APP_URL') || '';
    const finalWebhookUrl = webhookUrl || (appUrl ? `${appUrl}/api/webhooks/evolution` : '');

    if (!evoUrl || !evoApiKey || !instanceName) {
      throw new HttpException('Credenciais da Evolution API não configuradas.', HttpStatus.BAD_REQUEST);
    }

    const headers = { apikey: evoApiKey, 'Content-Type': 'application/json' };

    // 1. Check if instance exists
    let instanceExists = false;
    try {
      const fetchRes = await axios.get(`${evoUrl}/instance/fetchInstances`, { headers: { apikey: evoApiKey } });
      const rawList = fetchRes.data;
      const list: any[] = Array.isArray(rawList) ? rawList : (rawList?.value ?? []);
      instanceExists = list.some((inst: any) => inst.name === instanceName || inst.instanceName === instanceName);
    } catch (err) {
      this.logger.warn(`[Setup] Could not fetch instances: ${err.message}`);
    }

    // 2. Create instance if it does not exist
    if (!instanceExists) {
      this.logger.log(`[Setup] Instance "${instanceName}" not found. Creating...`);
      try {
        await axios.post(
          `${evoUrl}/instance/create`,
          {
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            groupsIgnore: true,
            readMessages: true,
            syncFullHistory: false,
          },
          { headers },
        );
        this.logger.log(`[Setup] Instance "${instanceName}" created successfully.`);
        // Wait a moment for the instance to initialize
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        this.logger.error(`[Setup] Failed to create instance: ${err.message}`);
        throw new HttpException(
          `Falha ao criar a instância "${instanceName}": ${err.response?.data?.message || err.message}`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    } else {
      this.logger.log(`[Setup] Instance "${instanceName}" already exists.`);
    }

    const warnings: string[] = [];

    // 3. Configure Webhook
    try {
      this.logger.log(`[Setup] Configuring webhook → ${finalWebhookUrl}`);
      await axios.post(
        `${evoUrl}/webhook/set/${instanceName}`,
        {
          webhook: {
            enabled: true,
            url: finalWebhookUrl,
            webhookByEvents: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
          },
        },
        { headers },
      );
    } catch (err) {
      this.logger.warn(`[Setup] Webhook config failed: ${err.message}`);
      warnings.push(`webhook: ${err.message}`);
    }

    // 4. Configure Instance Settings
    try {
      await axios.post(
        `${evoUrl}/settings/set/${instanceName}`,
        {
          rejectCall: false,
          msgCall: '',
          groupsIgnore: true,
          alwaysOnline: false,
          readMessages: true,
          readStatus: false,
          syncFullHistory: false,
        },
        { headers },
      );
    } catch (err) {
      this.logger.warn(`[Setup] Settings config failed: ${err.message}`);
      warnings.push(`settings: ${err.message}`);
    }

    return {
      success: true,
      instanceName,
      created: !instanceExists,
      webhookConfigured: !warnings.some(e => e.startsWith('webhook')),
      settingsConfigured: !warnings.some(e => e.startsWith('settings')),
      warnings,
    };
  }

  // 11. Logout Evolution API instance
  async logoutEvolution(): Promise<any> {
    const evoUrl = this.configService.get<string>('EVO_URL');
    const evoApiKey = this.configService.get<string>('EVO_API_KEY');
    const instanceName = this.configService.get<string>('EVO_INSTANCE');

    if (!evoUrl || !evoApiKey || !instanceName) {
      throw new HttpException('Credenciais da Evolution API não configuradas.', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`Logging out Evolution instance ${instanceName}`);
      const response = await axios.delete(
        `${evoUrl}/instance/logout/${instanceName}`,
        {
          headers: { apikey: evoApiKey },
        },
      );

      // Mark the channel as inactive in DB
      const supabase = this.supabaseService.getClient();
      await supabase
        .from('whatsapp_numbers')
        .update({ active: false })
        .eq('phone_number_id', `evolution:${instanceName}`);

      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      this.logger.error(`Error logging out Evolution instance: ${JSON.stringify(errorMsg)}`);
      throw new HttpException(
        { message: 'Falha ao desconectar instância', details: errorMsg },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
