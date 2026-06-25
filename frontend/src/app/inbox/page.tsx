'use client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import {
  Send,
  User,
  Check,
  CheckCheck,
  Lock,
  Unlock,
  AlertCircle,
  Inbox
} from 'lucide-react';

interface Contact {
  name: string;
  phone: string;
  type: string;
  profile_pic_url?: string | null;
}

interface Profile {
  id: string;
  name: string;
  role: string;
}

interface Conversation {
  id: string;
  contact_id: string;
  whatsapp_number_id: string;
  assigned_user_id: string | null;
  status: 'open' | 'closed';
  last_message_at: string;
  contacts: Contact;
  messages?: {
    content: string;
    created_at: string;
    direction: string;
  }[];
}

interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  wa_message_id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  sender_id: string | null;
  created_at: string;
}

export default function InboxPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConvRef = useRef<Conversation | null>(null);
  const filterStatusRef = useRef<'open' | 'closed'>('open');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  
  // Filtering & Chat Inputs
  const [filterStatus, setFilterStatus] = useState<'open' | 'closed'>('open');
  const [chatSearch, setChatSearch] = useState('');
  const [typedMessage, setTypedMessage] = useState('');
  
  // Status states
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  // Authentication check, load initial state
  useEffect(() => {
    async function initInbox() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setCurrentAgentId(session.user.id);
      
      // Load chats, agents, and set up realtime
      await Promise.all([
        loadConversations(),
        loadAgents()
      ]);
    }
    initInbox();
  }, [router, filterStatus]);

  // Load conversations list
  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingChats(true);
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          whatsapp_number_id,
          assigned_user_id,
          status,
          last_message_at,
          contacts ( name, phone, type, profile_pic_url ),
          messages (
            content,
            created_at,
            direction
          )
        `)
        .eq('status', filterStatusRef.current)
        .order('last_message_at', { ascending: false })
        .order('created_at', { ascending: false, referencedTable: 'messages' })
        .limit(1, { referencedTable: 'messages' });

      if (error) throw error;
      const convList = data as any[] || [];
      setConversations(convList);

      // Auto-select conversation if contactId is present in URL query
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const contactId = params.get('contactId');
        if (contactId) {
          const matchedConv = convList.find((c) => c.contact_id === contactId);
          if (matchedConv) {
            setActiveConv(matchedConv);
            await loadMessages(matchedConv.id);
            
            // Clean query parameter from URL
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  // Load all agents for dropdown assignment
  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, role');
      if (error) throw error;
      setAgents(data as Profile[] || []);
    } catch (err) {
      console.error('Error loading team members:', err);
    }
  };

  // Load messages for the selected active conversation
  const loadMessages = async (convId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data as Message[] || []);
    } catch (err) {
      console.error('Error loading chat messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Select a conversation from list
  const handleSelectConv = async (conv: Conversation) => {
    setActiveConv(conv);
    await loadMessages(conv.id);

    // Auto-assign to current agent if unassigned to clear the blue dot
    if (!conv.assigned_user_id && currentAgentId) {
      // Optimistically update conversations and activeConv states
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, assigned_user_id: currentAgentId } : c))
      );
      setActiveConv((prev) => prev ? { ...prev, assigned_user_id: currentAgentId } : null);

      handleAssignAgent(currentAgentId, conv.id);
    }
  };

  // Scroll to bottom of chat list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep refs in sync so realtime handlers always see latest values
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);
  useEffect(() => { filterStatusRef.current = filterStatus; }, [filterStatus]);

  // Polling fallback — refreshes conversation list every 10s in case Supabase Realtime isn't enabled
  useEffect(() => {
    const poll = setInterval(() => loadConversations(true), 10000);
    return () => clearInterval(poll);
  }, []);

  // Real-time listener — mounted once, uses ref to avoid stale closures
  useEffect(() => {
    const messageSub = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          const current = activeConvRef.current;

          if (payload.eventType === 'UPDATE') {
            // Filter out nulls — Supabase sends null for unchanged columns without REPLICA IDENTITY FULL
            const patch = Object.fromEntries(Object.entries(newMsg).filter(([, v]) => v != null));
            if (patch.id) {
              setMessages((prev) => prev.map((msg) => msg.id === patch.id ? { ...msg, ...patch } : msg));
            }
          } else if (payload.eventType === 'INSERT' && current && newMsg.conversation_id === current.id) {
            setMessages((prev) => {
              // Already added via API response — skip to avoid duplicate
              if (prev.some((m) => m.id === newMsg.id)) return prev;

              const tempIndex = prev.findIndex(
                (m) => m.id.startsWith('temp_') && m.content === newMsg.content && m.direction === newMsg.direction
              );
              if (tempIndex !== -1) {
                const next = [...prev];
                next[tempIndex] = newMsg;
                return next;
              }
              return [...prev, newMsg];
            });
          }

          loadConversations(true);
        }
      )
      .subscribe();

    const convSub = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const updatedConv = payload.new as Conversation;

          setConversations((prev) =>
            prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
          );

          if (activeConvRef.current?.id === updatedConv.id) {
            setActiveConv((prev) => prev ? { ...prev, ...updatedConv } : null);
          }
        }
      )
      .subscribe();

    return () => {
      messageSub.unsubscribe();
      convSub.unsubscribe();
    };
  }, []);

  // Send WhatsApp message via NestJS gateway
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !typedMessage.trim() || sending) return;

    setSending(true);
    const messageContent = typedMessage;
    setTypedMessage('');

    // Optimistic update — show message instantly before backend confirms
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: activeConv.id,
      direction: 'outbound',
      content: messageContent,
      wa_message_id: tempId,
      status: 'sent',
      sender_id: currentAgentId,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        alert('Sessão expirada. Por favor, logue novamente.');
        router.push('/login');
        return;
      }

      const res = await fetch(`${BACKEND_URL}/api/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          conversationId: activeConv.id,
          content: messageContent
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.details?.message || resData.message || 'Falha ao enviar mensagem.');
      }

      // Replace temp with real message immediately using the API response
      // This avoids a race condition where realtime INSERT arrives after status UPDATE
      if (resData.message?.id) {
        setMessages((prev) => prev.map((m) =>
          m.id === tempId ? { ...m, ...resData.message } : m
        ));
      }
    } catch (err: any) {
      console.error(err);
      // Remove optimistic message on failure and restore input
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setTypedMessage(messageContent);
      alert(`Erro: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  // Toggle Conversation Status (open vs closed)
  const handleToggleStatus = async () => {
    if (!activeConv) return;
    const nextStatus = activeConv.status === 'open' ? 'closed' : 'open';

    try {
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND_URL}/api/conversations/${activeConv.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(await res.text());

      if (filterStatus !== nextStatus) {
        setActiveConv(null);
        setMessages([]);
      }
      loadConversations(true);
    } catch (err) {
      console.error('Error changing conversation status:', err);
    }
  };

  // Assign agent helper
  const handleAssignAgent = async (agentId: string, convId?: string) => {
    const targetConvId = convId || activeConv?.id;
    if (!targetConvId) return;

    try {
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND_URL}/api/conversations/${targetConvId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ assignedUserId: agentId || null }),
      });
      if (!res.ok) throw new Error(await res.text());

      if (activeConv && targetConvId === activeConv.id) {
        setActiveConv(prev => prev ? { ...prev, assigned_user_id: agentId || null } : null);
      }
      loadConversations(true);
    } catch (err) {
      console.error('Error assigning agent:', err);
    }
  };

  // Filter list by search criteria
  const filteredConversations = conversations.filter((c) => {
    const term = chatSearch.toLowerCase();
    const lastMsg = c.messages?.[0]?.content?.toLowerCase() || '';
    return (
      c.contacts?.name?.toLowerCase().includes(term) ||
      c.contacts?.phone?.includes(term) ||
      lastMsg.includes(term)
    );
  });

  return (
    <div style={styles.inboxContainer}>
      
      {/* 1. Left Conversation Directory Panel */}
      <div style={styles.leftPanel} className="glass-panel">
        <div style={styles.leftHeader}>
          <h2 style={styles.leftTitle}>Mensagens</h2>
          
          {/* Status Segment Control */}
          <div style={styles.statusTabs}>
            <button 
              onClick={() => { setFilterStatus('open'); setActiveConv(null); setMessages([]); }}
              style={{
                ...styles.tabBtn,
                ...(filterStatus === 'open' ? styles.tabBtnActive : {})
              }}
            >
              Abertas
            </button>
            <button 
              onClick={() => { setFilterStatus('closed'); setActiveConv(null); setMessages([]); }}
              style={{
                ...styles.tabBtn,
                ...(filterStatus === 'closed' ? styles.tabBtnActive : {})
              }}
            >
              Fechadas
            </button>
          </div>

          {/* Chat Search */}
          <input
            type="text"
            placeholder="Filtrar conversas..."
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            className="input-field"
            style={{ fontSize: '0.85rem', padding: '8px 12px' }}
          />
        </div>

        {/* Chats scroll List */}
        <div style={styles.chatList} className="scroll-on-hover">
          {loadingChats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px' }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px' }}>
                  <div className="skeleton" style={{ width: '45px', height: '45px', borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '60%', height: '14px', borderRadius: '4px', marginBottom: '8px' }} />
                    <div className="skeleton" style={{ width: '85%', height: '10px', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <p style={styles.emptyChatsText}>Nenhum atendimento encontrado.</p>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = activeConv?.id === c.id;
              return (
                <div 
                  key={c.id} 
                  onClick={() => handleSelectConv(c)}
                  style={{
                    ...styles.chatRow,
                    ...(isSelected ? styles.chatRowActive : {})
                  }}
                >
                  <div style={styles.chatAvatar}>
                    {c.contacts?.profile_pic_url ? (
                      <img
                        src={c.contacts.profile_pic_url}
                        alt={c.contacts.name}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      c.contacts?.name?.charAt(0).toUpperCase() || 'C'
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={styles.chatRowMeta}>
                      <span style={styles.chatRowName}>{c.contacts?.name}</span>
                      <span style={styles.chatRowTime}>
                        {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span style={styles.chatLastMessageText}>
                      {c.messages?.[0]?.content || 'Sem mensagens'}
                    </span>
                  </div>
                  {c.status === 'open' && !c.assigned_user_id && (
                    <div style={styles.unreadIndicator}></div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Messaging workspace Panel */}
      <div style={styles.rightPanel} className="glass-panel">
        {activeConv ? (
          <div style={styles.activeChatContainer}>
            {/* Header detailing contact */}
            <div style={styles.chatHeader}>
              <div style={styles.chatHeaderLeft}>
                <div style={styles.headerAvatar}>
                  {activeConv.contacts?.profile_pic_url ? (
                    <img
                      src={activeConv.contacts.profile_pic_url}
                      alt={activeConv.contacts.name}
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    activeConv.contacts?.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 style={styles.headerName}>{activeConv.contacts?.name}</h3>
                  <p style={styles.headerPhone}>{activeConv.contacts?.phone}</p>
                </div>
                <span className={`badge badge-${activeConv.contacts?.type?.toLowerCase() === 'eleitor' ? 'eleitor' : 'militante'}`}>
                  {activeConv.contacts?.type}
                </span>
              </div>

              {/* Assignment and closing control buttons */}
              <div style={styles.chatHeaderRight}>
                {/* Agent Assignment Selector */}
                <div style={styles.assignWrapper}>
                  <User size={14} color="var(--text-muted)" />
                  <select
                    value={activeConv.assigned_user_id || ''}
                    onChange={(e) => handleAssignAgent(e.target.value)}
                    style={styles.assignSelect}
                  >
                    <option value="">Ninguém atribuído</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.role === 'admin' ? 'Adm' : 'Ate'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status toggler */}
                <button 
                  onClick={handleToggleStatus}
                  className={`btn ${activeConv.status === 'open' ? 'btn-danger' : 'btn-primary'}`}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  {activeConv.status === 'open' ? (
                    <>
                      <Lock size={14} />
                      <span>Fechar Chat</span>
                    </>
                  ) : (
                    <>
                      <Unlock size={14} />
                      <span>Reabrir Chat</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Chat message stream */}
            <div style={styles.messageStream} className="scroll-on-hover">
              {loadingMessages ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div className="skeleton" style={{ width: '220px', height: '40px', borderRadius: '0 12px 12px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div className="skeleton" style={{ width: '150px', height: '40px', borderRadius: '12px 0 12px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div className="skeleton" style={{ width: '310px', height: '54px', borderRadius: '0 12px 12px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div className="skeleton" style={{ width: '180px', height: '40px', borderRadius: '12px 0 12px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div className="skeleton" style={{ width: '120px', height: '40px', borderRadius: '0 12px 12px 12px' }} />
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div style={styles.startConversationBox}>
                  <AlertCircle size={28} color="var(--text-muted)" />
                  <p>Inicie a conversa enviando uma mensagem no campo abaixo.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOutbound = msg.direction === 'outbound';
                  return (
                    <div 
                      key={msg.id}
                      style={{
                        ...styles.messageRow,
                        justifyContent: isOutbound ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div 
                        style={{
                          ...styles.messageBubble,
                          ...(isOutbound ? styles.outboundBubble : styles.inboundBubble)
                        }}
                      >
                        <p style={styles.messageText}>{msg.content}</p>
                        
                        <div style={styles.messageMeta}>
                          <span style={styles.messageTime}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isOutbound && (
                            <span style={styles.statusIcons}>
                              {msg.status === 'sent' && <Check size={14} color="#8696a0" />}
                              {msg.status === 'delivered' && <CheckCheck size={14} color="#8696a0" />}
                              {msg.status === 'read' && <CheckCheck size={14} color="#53bdeb" />}
                              {msg.status === 'failed' && <span style={{ color: 'var(--danger)', fontSize: '0.7rem' }}>!</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Outbound Messaging input area */}
            <form onSubmit={(e) => e.preventDefault()} style={styles.messageInputForm}>
              <textarea
                placeholder={
                  activeConv.status === 'closed'
                    ? 'Este atendimento está FECHADO. Reabra-o para enviar mensagens.'
                    : 'Digite uma mensagem'
                }
                disabled={activeConv.status === 'closed' || sending}
                value={typedMessage}
                onChange={(e) => setTypedMessage(e.target.value)}
                style={styles.messageTextarea}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={activeConv.status === 'closed' || !typedMessage.trim() || sending}
                style={{
                  ...styles.sendBtn,
                  opacity: (activeConv.status === 'closed' || !typedMessage.trim() || sending) ? 0.4 : 1
                }}
                title="Enviar Mensagem"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        ) : (
          <div style={styles.emptyInboxState}>
            <Inbox size={64} color="var(--text-muted)" />
            <h3>Caixa de Atendimento</h3>
            <p>Selecione uma conversa ao lado para visualizar o histórico de mensagens e responder em tempo real.</p>
          </div>
        )}
      </div>

    </div>
  );
}

const styles = {
  inboxContainer: {
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    gap: '20px',
    height: '100vh',
    margin: 0,
    boxSizing: 'border-box' as const,
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    padding: '20px 16px',
    boxSizing: 'border-box' as const,
    overflow: 'hidden',
  },
  leftHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '20px',
    borderBottom: '1px solid var(--border-muted)',
    paddingBottom: '16px',
  },
  leftTitle: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  statusTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    background: 'var(--bg-base)',
    borderRadius: '8px',
    padding: '3px',
    border: '1px solid var(--border-muted)',
  },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '6px 0',
    fontSize: '0.8rem',
    fontWeight: 500,
    borderRadius: '6px',
    transition: 'all 0.2s',
  },
  tabBtnActive: {
    background: 'var(--bg-surface)',
    color: 'var(--primary)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    fontWeight: 600,
  },
  chatList: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    paddingRight: '8px',
  },
  inboxSpinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px',
  },
  emptyChatsText: {
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    marginTop: '40px',
  },
  chatRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '10px',
    cursor: 'pointer',
    border: '1px solid transparent',
    borderColor: 'transparent',
    background: 'transparent',
    outline: 'none',
    transition: 'all 0.2s',
  },
  chatRowActive: {
    background: 'var(--bg-surface-active)',
    borderColor: 'var(--border-bright)',
  },
  chatAvatar: {
    width: '45px',
    height: '45px',
    borderRadius: '50%',
    background: '#e9edef',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#54656f',
    fontWeight: 500,
    fontSize: '1rem',
    flexShrink: 0,
  },
  chatRowMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatRowName: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '140px',
  },
  chatRowTime: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  chatLastMessageText: {
    fontSize: '0.82rem',
    color: '#667781',
    display: 'block',
    marginTop: '4px',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '220px',
  },
  unreadIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--primary)',
  },
  rightPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'hidden',
  },
  emptyInboxState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '40px',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    gap: '12px',
  },
  activeChatContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },
  chatHeader: {
    padding: '10px 24px',
    borderBottom: '1px solid #e9edef',
    background: '#f0f2f5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--primary-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '1.05rem',
  },
  headerName: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#111b21',
  },
  headerPhone: {
    fontSize: '0.8rem',
    color: '#667781',
    marginTop: '2px',
  },
  chatHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  assignWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#ffffff',
    border: '1px solid #e9edef',
    borderRadius: '8px',
    padding: '4px 8px',
  },
  assignSelect: {
    background: 'transparent',
    border: 'none',
    color: '#54656f',
    fontSize: '0.8rem',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },
  messageStream: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    background: '#efeae2',
  },
  startConversationBox: {
    margin: 'auto',
    textAlign: 'center' as const,
    color: '#667781',
    fontSize: '0.85rem',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    maxWidth: '280px',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '65%',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '0.92rem',
    lineHeight: '1.45',
    boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
    position: 'relative' as const,
  },
  inboundBubble: {
    background: '#ffffff',
    color: '#111b21',
    borderTopLeftRadius: '0px',
  },
  outboundBubble: {
    background: '#d9fdd3',
    color: '#111b21',
    borderTopRightRadius: '0px',
  },
  messageText: {
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
  },
  messageMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '6px',
    marginTop: '4px',
  },
  messageTime: {
    fontSize: '0.68rem',
    color: '#667781',
  },
  statusIcons: {
    display: 'flex',
    alignItems: 'center',
  },
  messageInputForm: {
    padding: '12px 24px',
    borderTop: '1px solid #e9edef',
    background: '#f0f2f5',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  messageTextarea: {
    flex: 1,
    background: '#ffffff',
    border: 'none',
    borderRadius: '24px',
    padding: '10px 18px',
    color: '#111b21',
    fontFamily: 'inherit',
    fontSize: '0.92rem',
    outline: 'none',
    resize: 'none' as const,
    height: '40px',
    boxSizing: 'border-box' as const,
    transition: 'all 0.2s',
  },
  sendBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'transparent',
    color: '#54656f',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: 'none',
  },
};
