-- ========================================================
-- CRM WHATSAPP SAAS - SQL SEED DATA FOR TESTING
-- ========================================================

-- Instructions: Copy and run this script in your Supabase SQL Editor.
-- Make sure you have already executed schema.sql.

DO $$
DECLARE
    waba_id_var UUID;
    contact1_id UUID;
    contact2_id UUID;
    contact3_id UUID;
    contact4_id UUID;
    contact5_id UUID;
    contact6_id UUID;
    contact7_id UUID;
    contact8_id UUID;
    contact9_id UUID;
    contact10_id UUID;
    
    conv1_id UUID;
    conv2_id UUID;
    conv3_id UUID;
    conv4_id UUID;
    conv5_id UUID;
    conv6_id UUID;
    conv7_id UUID;
    conv8_id UUID;
    conv9_id UUID;
    conv10_id UUID;
BEGIN
    -- 1. Insert a Mock WhatsApp Business Account (WABA) number
    INSERT INTO public.whatsapp_numbers (name, phone_number_id, phone_number, access_token, waba_id, active)
    VALUES (
        'Canal Principal de Campanha',
        '105938502598305',
        '+5511999999999',
        'EAAW...MOCK_TOKEN', -- Placeholder token
        '205938502598309',
        TRUE
    )
    ON CONFLICT (phone_number_id) DO UPDATE 
    SET name = EXCLUDED.name
    RETURNING id INTO waba_id_var;

    IF waba_id_var IS NULL THEN
        SELECT id INTO waba_id_var FROM public.whatsapp_numbers WHERE phone_number_id = '105938502598305';
    END IF;

    -- 2. Insert Mock Contacts (Voters & Militants)
    -- Contact 1
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Arthur Silva', '+5511988880001', '11', 'São Paulo', 'SP', 'Sudeste', 'ELEITOR', 'Interessado em propostas de transporte e mobilidade urbana.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact1_id;
    
    -- Contact 2
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Mariana Santos', '+5521988880002', '21', 'Rio de Janeiro', 'RJ', 'Sudeste', 'MILITANTE', 'Militante ativa. Líder comunitária na zona norte do Rio.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact2_id;

    -- Contact 3
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Carlos Drummond', '+5531988880003', '31', 'Belo Horizonte', 'MG', 'Sudeste', 'ELEITOR', 'Dúvidas sobre o plano de governo para educação básica.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact3_id;

    -- Contact 4
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Beatriz Souza', '+5571988880004', '71', 'Salvador', 'BA', 'Nordeste', 'MILITANTE', 'Disponível para distribuição de panfletos na região central.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact4_id;

    -- Contact 5
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Eduardo Rocha', '+5551988880005', '51', 'Porto Alegre', 'RS', 'Sul', 'ELEITOR', 'Enviou sugestão para o site oficial e quer acompanhar novidades.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact5_id;

    -- Contact 6
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Fernanda Lima', '+5561988880006', '61', 'Brasília', 'DF', 'Centro-Oeste', 'ELEITOR', 'Preocupada com questões de saúde pública e saneamento.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact6_id;

    -- Contact 7
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Guilherme Mendes', '+5581988880007', '81', 'Recife', 'PE', 'Nordeste', 'MILITANTE', 'Organizador de carreatas locais e apoio comunitário.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact7_id;

    -- Contact 8
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Patricia Oliveira', '+5511988880008', '11', 'Campinas', 'SP', 'Sudeste', 'ELEITOR', 'Gostaria de saber a agenda de visitas do candidato em Campinas.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact8_id;

    -- Contact 9
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Roberto Antunes', '+5541988880009', '41', 'Curitiba', 'PR', 'Sul', 'ELEITOR', 'Críticas construtivas sobre segurança pública no bairro industrial.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact9_id;

    -- Contact 10
    INSERT INTO public.contacts (name, phone, ddd, city, state, region, type, notes)
    VALUES ('Juliana Costa', '+5585988880010', '85', 'Fortaleza', 'CE', 'Nordeste', 'MILITANTE', 'Ajudando no engajamento de redes sociais e grupos de WhatsApp.')
    ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO contact10_id;

    -- Retrieve IDs for contacts in case they were updated
    SELECT id INTO contact1_id FROM public.contacts WHERE phone = '+5511988880001';
    SELECT id INTO contact2_id FROM public.contacts WHERE phone = '+5521988880002';
    SELECT id INTO contact3_id FROM public.contacts WHERE phone = '+5531988880003';
    SELECT id INTO contact4_id FROM public.contacts WHERE phone = '+5571988880004';
    SELECT id INTO contact5_id FROM public.contacts WHERE phone = '+5551988880005';
    SELECT id INTO contact6_id FROM public.contacts WHERE phone = '+5561988880006';
    SELECT id INTO contact7_id FROM public.contacts WHERE phone = '+5581988880007';
    SELECT id INTO contact8_id FROM public.contacts WHERE phone = '+5511988880008';
    SELECT id INTO contact9_id FROM public.contacts WHERE phone = '+5541988880009';
    SELECT id INTO contact10_id FROM public.contacts WHERE phone = '+5585988880010';

    -- 3. Create Conversations
    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact1_id, waba_id_var, 'open', NOW() - INTERVAL '5 minutes')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv1_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact2_id, waba_id_var, 'open', NOW() - INTERVAL '15 minutes')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv2_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact3_id, waba_id_var, 'open', NOW() - INTERVAL '1 hour')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv3_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact4_id, waba_id_var, 'open', NOW() - INTERVAL '3 hours')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv4_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact5_id, waba_id_var, 'open', NOW() - INTERVAL '5 hours')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv5_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact6_id, waba_id_var, 'closed', NOW() - INTERVAL '1 day')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv6_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact7_id, waba_id_var, 'open', NOW() - INTERVAL '2 days')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv7_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact8_id, waba_id_var, 'open', NOW() - INTERVAL '3 days')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv8_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact9_id, waba_id_var, 'open', NOW() - INTERVAL '4 days')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv9_id;

    INSERT INTO public.conversations (contact_id, whatsapp_number_id, status, last_message_at)
    VALUES (contact10_id, waba_id_var, 'closed', NOW() - INTERVAL '5 days')
    ON CONFLICT ON CONSTRAINT unique_contact_waba DO UPDATE SET last_message_at = EXCLUDED.last_message_at RETURNING id INTO conv10_id;

    -- Retrieve IDs for conversations in case they were updated
    SELECT id INTO conv1_id FROM public.conversations WHERE contact_id = contact1_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv2_id FROM public.conversations WHERE contact_id = contact2_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv3_id FROM public.conversations WHERE contact_id = contact3_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv4_id FROM public.conversations WHERE contact_id = contact4_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv5_id FROM public.conversations WHERE contact_id = contact5_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv6_id FROM public.conversations WHERE contact_id = contact6_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv7_id FROM public.conversations WHERE contact_id = contact7_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv8_id FROM public.conversations WHERE contact_id = contact8_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv9_id FROM public.conversations WHERE contact_id = contact9_id AND whatsapp_number_id = waba_id_var;
    SELECT id INTO conv10_id FROM public.conversations WHERE contact_id = contact10_id AND whatsapp_number_id = waba_id_var;

    -- 4. Insert Messages for Each Conversation

    -- Conversation 1 (Arthur)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv1_id, 'inbound', 'Olá! Gostaria de saber quais são as propostas do candidato para o trânsito na capital. As linhas de ônibus estão péssimas.', 'wamid.arthur_msg_1', 'read', NOW() - INTERVAL '10 minutes'),
        (conv1_id, 'outbound', 'Olá Arthur! Agradecemos o contato. O nosso candidato planeja expandir as faixas exclusivas de ônibus e integrar as linhas periféricas por bilhete único temporal.', 'wamid.rep_arthur_1', 'read', NOW() - INTERVAL '8 minutes'),
        (conv1_id, 'inbound', 'Excelente. E quanto à ciclovias? Haverá expansão?', 'wamid.arthur_msg_2', 'read', NOW() - INTERVAL '5 minutes');

    -- Conversation 2 (Mariana)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv2_id, 'inbound', 'Boa tarde! Organizei a reunião de militantes aqui na Tijuca para a próxima quinta-feira às 19h. Conseguimos confirmar 35 apoiadores.', 'wamid.mariana_msg_1', 'read', NOW() - INTERVAL '25 minutes'),
        (conv2_id, 'outbound', 'Sensacional, Mariana! Muito obrigado pelo engajamento. Vou confirmar com a coordenação de campanha a presença de um representante oficial.', 'wamid.rep_mariana_1', 'read', NOW() - INTERVAL '20 minutes'),
        (conv2_id, 'inbound', 'Perfeito! Se puder mandar material de panfletagem também, nos ajudaria bastante.', 'wamid.mariana_msg_2', 'read', NOW() - INTERVAL '15 minutes');

    -- Conversation 3 (Carlos)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv3_id, 'inbound', 'Olá, sou professor da rede municipal de BH. Qual a proposta para valorização salarial e concurso público?', 'wamid.carlos_msg_1', 'read', NOW() - INTERVAL '1 hour 10 minutes'),
        (conv3_id, 'outbound', 'Olá professor Carlos! Valorizar a educação é prioridade. Nossa proposta inclui reajuste salarial acima do piso nacional progressivamente e abertura de novo edital no primeiro semestre.', 'wamid.rep_carlos_1', 'read', NOW() - INTERVAL '1 hour');

    -- Conversation 4 (Beatriz)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv4_id, 'inbound', 'Já estou com o bloco de adesivos aqui no comitê de Salvador. Vamos distribuir no Farol da Barra amanhã de manhã!', 'wamid.beatriz_msg_1', 'read', NOW() - INTERVAL '3 hours 15 minutes'),
        (conv4_id, 'outbound', 'Excelente iniciativa, Beatriz! Mande fotos da ação para publicarmos nas redes oficiais da militância.', 'wamid.rep_beatriz_1', 'read', NOW() - INTERVAL '3 hours');

    -- Conversation 5 (Eduardo)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv5_id, 'inbound', 'Tentei me cadastrar no site do candidato para ser voluntário em Porto Alegre, mas deu erro no formulário.', 'wamid.eduardo_msg_1', 'read', NOW() - INTERVAL '5 hours 30 minutes'),
        (conv5_id, 'outbound', 'Desculpe pelo transtorno, Eduardo. Nossa equipe de TI já corrigiu o formulário. Pode tentar novamente por este link ou nos passar seus dados por aqui!', 'wamid.rep_eduardo_1', 'read', NOW() - INTERVAL '5 hours');

    -- Conversation 6 (Fernanda)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv6_id, 'inbound', 'Quando será o próximo comício em Brasília?', 'wamid.fernanda_msg_1', 'read', NOW() - INTERVAL '1 day 2 hours'),
        (conv6_id, 'outbound', 'Olá Fernanda! O comício em Brasília está agendado para o próximo sábado na Esplanada, a partir das 16h. Esperamos você lá!', 'wamid.rep_fernanda_1', 'read', NOW() - INTERVAL '1 day 1 hour'),
        (conv6_id, 'inbound', 'Obrigada! Vou com a minha família.', 'wamid.fernanda_msg_2', 'read', NOW() - INTERVAL '1 day');

    -- Conversation 7 (Guilherme)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv7_id, 'inbound', 'As bandeiras da carreata em Recife já estão prontas no galpão. Precisamos de um caminhão de som adicional.', 'wamid.guilherme_msg_1', 'read', NOW() - INTERVAL '2 days 1 hour'),
        (conv7_id, 'outbound', 'Entendido, Guilherme. A assessoria financeira já está liberando a contratação do som de apoio. Entraremos em contato com o fornecedor.', 'wamid.rep_guilherme_1', 'read', NOW() - INTERVAL '2 days');

    -- Conversation 8 (Patricia)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv8_id, 'inbound', 'Gostaria de agendar uma reunião com o candidato para apresentar o projeto comunitário de Campinas.', 'wamid.patricia_msg_1', 'read', NOW() - INTERVAL '3 days 1 hour'),
        (conv8_id, 'outbound', 'Olá Patricia, o candidato tem a agenda muito disputada nesta reta final, mas podemos agendar com o coordenador regional. O que acha?', 'wamid.rep_patricia_1', 'read', NOW() - INTERVAL '3 days');

    -- Conversation 9 (Roberto)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv9_id, 'inbound', 'A segurança no bairro industrial em Curitiba está crítica. Precisamos de mais policiamento nas estações-tubo.', 'wamid.roberto_msg_1', 'read', NOW() - INTERVAL '4 days 1 hour'),
        (conv9_id, 'outbound', 'Olá Roberto! Entendemos a urgência. O plano municipal de segurança do candidato prevê a instalação de totens de monitoramento 24h e integração de guardas civis.', 'wamid.rep_roberto_1', 'read', NOW() - INTERVAL '4 days');

    -- Conversation 10 (Juliana)
    INSERT INTO public.messages (conversation_id, direction, content, wa_message_id, status, created_at)
    VALUES 
        (conv10_id, 'inbound', 'Acabei de postar o vídeo de apoio no Instagram do grupo da juventude de Fortaleza!', 'wamid.juliana_msg_1', 'read', NOW() - INTERVAL '5 days 2 hours'),
        (conv10_id, 'outbound', 'Incrível, Juliana! Compartilhamos o post nos stories oficiais. Vamos juntos rumo à vitória!', 'wamid.rep_juliana_1', 'read', NOW() - INTERVAL '5 days 1 hour');

END $$;
