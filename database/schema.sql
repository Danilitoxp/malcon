-- ==========================================
-- CRM WHATSAPP SAAS DATABASE SCHEMA MIGRATION
-- ==========================================

-- 1. Create Enums for Strict Typing
CREATE TYPE public.user_role AS ENUM ('admin', 'agent');
CREATE TYPE public.contact_type AS ENUM ('ELEITOR', 'MILITANTE');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
CREATE TYPE public.conversation_status AS ENUM ('open', 'closed');

-- 2. Profiles Table (Linked to Supabase Auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. WhatsApp Numbers Table (Meta Credentials & Active Numbers)
CREATE TABLE public.whatsapp_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone_number_id TEXT UNIQUE NOT NULL, -- Meta's Phone Number ID
    phone_number TEXT NOT NULL,          -- E.164 phone number
    access_token TEXT NOT NULL,          -- Encrypted token (AES-256-GCM)
    waba_id TEXT,                        -- WhatsApp Business Account ID
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;

-- 4. Contacts Table (CRM Contacts Segmented by Type and Location)
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,           -- Unique E.164 phone number
    ddd VARCHAR(3) NOT NULL,             -- Extracted DDD code (e.g. '11')
    city TEXT,
    state VARCHAR(2),
    region TEXT,
    type public.contact_type NOT NULL DEFAULT 'ELEITOR',
    notes TEXT,
    profile_pic_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for efficient filtering and searching
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_ddd ON public.contacts(ddd);
CREATE INDEX idx_contacts_region ON public.contacts(region);
CREATE INDEX idx_contacts_type ON public.contacts(type);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 5. Conversations Table
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_number_id UUID NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status public.conversation_status NOT NULL DEFAULT 'open',
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_contact_waba UNIQUE (contact_id, whatsapp_number_id)
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Indexes for Inbox sorting
CREATE INDEX idx_conversations_last_msg ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversations_assigned ON public.conversations(assigned_user_id);
CREATE INDEX idx_conversations_status ON public.conversations(status);

-- 6. Messages Table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    direction public.message_direction NOT NULL,
    content TEXT NOT NULL,
    wa_message_id TEXT UNIQUE,            -- ID returned by Meta Cloud API
    status public.message_status NOT NULL DEFAULT 'sent',
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Send full row on UPDATE so Supabase Realtime doesn't deliver partial nulls
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Index for ordering message lists within conversations
CREATE INDEX idx_messages_conversation_date ON public.messages(conversation_id, created_at ASC);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) HELPER & POLICIES
-- ==========================================

-- Helper function to check if the current auth user is an Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  );
END;
$$ LANGUAGE plpgsql;

-- 7. Policies for Profiles
CREATE POLICY "Allow select on profiles to authenticated users" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all on profiles to admin users only" 
    ON public.profiles FOR ALL 
    USING (public.is_admin());

-- 8. Policies for WhatsApp Numbers
CREATE POLICY "Allow select on whatsapp_numbers to authenticated users" 
    ON public.whatsapp_numbers FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow all on whatsapp_numbers to admin users only" 
    ON public.whatsapp_numbers FOR ALL 
    USING (public.is_admin());

-- 9. Policies for Contacts
CREATE POLICY "Allow select on contacts to authenticated users" 
    ON public.contacts FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow insert on contacts to authenticated users" 
    ON public.contacts FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow update on contacts to authenticated users" 
    ON public.contacts FOR UPDATE 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow delete on contacts to admin users only" 
    ON public.contacts FOR DELETE 
    USING (public.is_admin());

-- 10. Policies for Conversations
CREATE POLICY "Allow select on conversations to authenticated users" 
    ON public.conversations FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow insert on conversations to authenticated users" 
    ON public.conversations FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow update on conversations to authenticated users" 
    ON public.conversations FOR UPDATE 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow delete on conversations to admin users only" 
    ON public.conversations FOR DELETE 
    USING (public.is_admin());

-- 11. Policies for Messages
CREATE POLICY "Allow select on messages to authenticated users" 
    ON public.messages FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow insert on messages to authenticated users" 
    ON public.messages FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow update on messages to admin users only" 
    ON public.messages FOR UPDATE 
    USING (public.is_admin());

CREATE POLICY "Allow delete on messages to admin users only" 
    ON public.messages FOR DELETE 
    USING (public.is_admin());

-- ==========================================
-- TRIGGERS & FUNCTIONS
-- ==========================================

-- Automate user profile creation upon Supabase Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Novo Usuário'),
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'agent'::public.user_role)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Supabase Realtime for Messages and Conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
