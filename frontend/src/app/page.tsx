'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  UserCheck, 
  Flame, 
  MessageSquare, 
  Send, 
  PlusCircle, 
  FolderInput, 
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  totalContacts: number;
  totalVoters: number;
  totalMilitants: number;
  activeChats: number;
  messagesSent: number;
}

interface RecentChat {
  id: string;
  last_message_at: string;
  status: string;
  contacts: { id: string; name: string; phone: string; type: string } | null;
  messages?: { content: string; direction: string }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalVoters: 0,
    totalMilitants: 0,
    activeChats: 0,
    messagesSent: 0,
  });
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Authentication check & Fetch stats
  useEffect(() => {
    async function checkAuthAndFetchStats() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      try {
        // Parallel queries to fetch CRM metrics
        const [
          contactsRes,
          votersRes,
          militantsRes,
          activeChatsRes,
          messagesSentRes,
          recentChatsRes
        ] = await Promise.all([
          supabase.from('contacts').select('*', { count: 'exact', head: true }),
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('type', 'ELEITOR'),
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('type', 'MILITANTE'),
          supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('messages').select('*', { count: 'exact', head: true }).eq('direction', 'outbound'),
          supabase.from('conversations').select(`
            id,
            last_message_at,
            status,
            contacts ( id, name, phone, type ),
            messages (
              content,
              created_at,
              direction
            )
          `)
          .order('last_message_at', { ascending: false })
          .order('created_at', { foreignTable: 'messages', ascending: false })
          .limit(5)
          .limit(1, { foreignTable: 'messages' })
        ]);

        setStats({
          totalContacts: contactsRes.count || 0,
          totalVoters: votersRes.count || 0,
          totalMilitants: militantsRes.count || 0,
          activeChats: activeChatsRes.count || 0,
          messagesSent: messagesSentRes.count || 0,
        });

        if (recentChatsRes.data) {
          setRecentChats(recentChatsRes.data as any[]);
        }
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndFetchStats();
  }, [router]);

  if (loading) {
    return (
      <div style={styles.container}>
        {/* Dashboard Top Header Skeleton */}
        <div style={styles.header}>
          <div>
            <div className="skeleton" style={{ width: '160px', height: '28px', borderRadius: '6px' }}></div>
            <div className="skeleton" style={{ width: '320px', height: '16px', borderRadius: '4px', marginTop: '8px' }}></div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="skeleton" style={{ width: '130px', height: '38px', borderRadius: '8px' }}></div>
            <div className="skeleton" style={{ width: '130px', height: '38px', borderRadius: '8px' }}></div>
          </div>
        </div>

        {/* Metrics Grid Skeleton */}
        <div style={styles.metricsGrid}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-panel" style={{ ...styles.card, borderLeft: '4px solid #cbd5e1' }}>
              <div className="skeleton" style={{ width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0 }} />
              <div style={{ ...styles.cardInfo, width: '100%' }}>
                <div className="skeleton" style={{ width: '60%', height: '10px', borderRadius: '4px' }} />
                <div className="skeleton" style={{ width: '40%', height: '24px', borderRadius: '6px', margin: '8px 0' }} />
                <div className="skeleton" style={{ width: '50%', height: '10px', borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Detail Grid Skeleton */}
        <div style={styles.detailGrid}>
          {/* Analytics Simulation Skeleton */}
          <div className="glass-panel" style={styles.analyticsSection}>
            <div style={styles.sectionHeader}>
              <div className="skeleton" style={{ width: '180px', height: '20px', borderRadius: '4px' }} />
              <div className="skeleton" style={{ width: '110px', height: '22px', borderRadius: '9999px' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 0' }}>
              {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
                <div key={bar} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <div className="skeleton" style={{ width: '28px', height: `${40 + (bar * 12)}px`, borderRadius: '4px 4px 0 0' }} />
                  <div className="skeleton" style={{ width: '32px', height: '10px', borderRadius: '4px' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Recent Active Conversations Skeleton */}
          <div className="glass-panel" style={styles.recentSection}>
            <div style={styles.sectionHeader}>
              <div className="skeleton" style={{ width: '150px', height: '20px', borderRadius: '4px' }} />
              <div className="skeleton" style={{ width: '70px', height: '16px', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[1, 2, 3, 4].map((row) => (
                <div key={row} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '70%' }}>
                    <div className="skeleton" style={{ width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ width: '100%' }}>
                      <div className="skeleton" style={{ width: '50%', height: '12px', borderRadius: '4px', marginBottom: '6px' }} />
                      <div className="skeleton" style={{ width: '80%', height: '10px', borderRadius: '4px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <div className="skeleton" style={{ width: '50px', height: '18px', borderRadius: '9999px' }} />
                    <div className="skeleton" style={{ width: '30px', height: '10px', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const metricCards = [
    { title: 'Contatos Totais', value: stats.totalContacts, icon: Users, color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.08)', trend: 'Todos os canais' },
    { title: 'Eleitores', value: stats.totalVoters, icon: UserCheck, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', trend: `${stats.totalContacts > 0 ? Math.round((stats.totalVoters / stats.totalContacts) * 100) : 0}% do total` },
    { title: 'Militantes', value: stats.totalMilitants, icon: Flame, color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', trend: `${stats.totalContacts > 0 ? Math.round((stats.totalMilitants / stats.totalContacts) * 100) : 0}% do total` },
    { title: 'Conversas Ativas', value: stats.activeChats, icon: MessageSquare, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', trend: 'Aguardando retorno' },
    { title: 'Mensagens Enviadas', value: stats.messagesSent, icon: Send, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.08)', trend: 'Enviadas via WABA' },
  ];

  return (
    <div style={styles.container}>
      
      {/* Dashboard Top Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Painel Geral</h2>
          <p style={styles.subtitle}>Métricas consolidadas de contatos e interações de WhatsApp</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/contacts" style={{ textDecoration: 'none' }}>
            <button className="btn btn-secondary">
              <FolderInput size={18} />
              <span>Importar CSV</span>
            </button>
          </Link>
          <Link href="/inbox" style={{ textDecoration: 'none' }}>
            <button className="btn btn-primary">
              <MessageSquare size={18} />
              <span>Ir para o Chat</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={styles.metricsGrid}>
        {metricCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div 
              key={idx} 
              className="glass-panel" 
              style={{
                ...styles.card,
                borderLeft: `4px solid ${card.color}`
              }}
            >
              <div style={{ ...styles.iconBox, backgroundColor: card.bg }}>
                <Icon size={22} color={card.color} />
              </div>
              <div style={styles.cardInfo}>
                <span style={styles.cardLabel}>{card.title}</span>
                <h3 style={styles.cardValue}>{card.value}</h3>
                <span style={styles.cardTrend}>{card.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Graph simulation & Recent Chats */}
      <div style={styles.detailGrid}>
        
        {/* Analytics Simulation */}
        <div className="glass-panel" style={styles.analyticsSection}>
          <div style={styles.sectionHeader}>
            <h4 style={styles.sectionTitle}>Volume de Atendimento</h4>
            <div style={styles.badgeSuccess}>
              <TrendingUp size={14} />
              <span>+12.3% esta semana</span>
            </div>
          </div>
          
          <div style={styles.chartContainer}>
            {/* Y-Axis scale numbers */}
            <div style={styles.yAxis}>
              <span>120</span>
              <span>80</span>
              <span>40</span>
              <span>0</span>
            </div>
            
            <div style={styles.chartMainArea}>
              {/* Dotted horizontal grid lines */}
              <div style={styles.gridLines}>
                <div style={styles.gridLine}></div>
                <div style={styles.gridLine}></div>
                <div style={styles.gridLine}></div>
                <div style={styles.gridLine}></div>
              </div>
              
              {/* Bars */}
              <div style={styles.chartBars}>
                {[60, 45, 78, 95, 62, 85, 110].map((val, i) => {
                  const heightPercent = (val / 120) * 100;
                  return (
                    <div 
                      key={i} 
                      style={styles.chartCol}
                      onMouseEnter={() => setHoveredBar(i)}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      <div style={styles.barWrapper}>
                        {hoveredBar === i && (
                          <div style={styles.tooltip}>
                            {val} msgs
                          </div>
                        )}
                        <div 
                          style={{ 
                            ...styles.chartBar, 
                            height: `${heightPercent}%`,
                            background: hoveredBar === i 
                              ? 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)' 
                              : 'linear-gradient(180deg, #4f46e5 0%, rgba(79, 70, 229, 0.55) 100%)',
                            boxShadow: hoveredBar === i 
                              ? '0 4px 12px rgba(79, 70, 229, 0.25)' 
                              : 'none',
                          }} 
                        ></div>
                      </div>
                      <span style={styles.chartBarLabel}>
                        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Active Conversations */}
        <div className="glass-panel" style={styles.recentSection}>
          <div style={styles.sectionHeader}>
            <h4 style={styles.sectionTitle}>Últimas Mensagens</h4>
            <Link href="/inbox" style={styles.viewAllLink}>
              <span>Ver todas</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div style={styles.chatsList} className="scroll-on-hover">
            {recentChats.length === 0 ? (
              <p style={styles.emptyState}>Nenhuma conversa recente registrada.</p>
            ) : (
              recentChats.map((chat) => (
                <Link 
                  key={chat.id} 
                  href={`/inbox?contactId=${chat.contacts?.id || ''}`}
                  style={styles.chatRowLink}
                >
                  <div style={styles.chatInfo}>
                    <div style={styles.chatAvatar}>
                      {chat.contacts?.name?.charAt(0).toUpperCase() || 'C'}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <p style={styles.chatContactName}>{chat.contacts?.name || 'Contato'}</p>
                      <span style={styles.chatLastMessage}>
                        {chat.messages?.[0]?.content || 'Sem mensagens'}
                      </span>
                    </div>
                  </div>
                  <div style={styles.chatMeta}>
                    <span className={`badge badge-${chat.contacts?.type?.toLowerCase() === 'eleitor' ? 'eleitor' : 'militante'}`}>
                      {chat.contacts?.type}
                    </span>
                    <span style={styles.chatTime}>
                      {new Date(chat.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

const styles = {
  container: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    height: '100vh',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    marginTop: '4px',
    fontSize: '0.95rem',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '24px',
  },
  card: {
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    position: 'relative' as const,
  },
  iconBox: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  cardLabel: {
    fontSize: '0.82rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  cardValue: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '4px 0',
  },
  cardTrend: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    fontWeight: 400,
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1.6fr 1fr',
    gap: '24px',
  },
  analyticsSection: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '365px',
  },
  recentSection: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '365px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  badgeSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--success-glass)',
    color: 'var(--success)',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  viewAllLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--primary)',
    fontSize: '0.85rem',
    textDecoration: 'none',
    fontWeight: 500,
  },
  chartContainer: {
    flex: 1,
    display: 'flex',
    gap: '16px',
    paddingTop: '10px',
  },
  yAxis: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    height: '180px',
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    textAlign: 'right' as const,
    width: '24px',
    paddingBottom: '20px',
  },
  chartMainArea: {
    flex: 1,
    position: 'relative' as const,
    height: '180px',
  },
  gridLines: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    pointerEvents: 'none' as const,
  },
  gridLine: {
    borderBottom: '1px dashed #e2e8f0',
    width: '100%',
    height: '1px',
  },
  chartBars: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
  },
  chartCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    cursor: 'pointer',
  },
  barWrapper: {
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    position: 'relative' as const,
    paddingBottom: '4px',
  },
  chartBar: {
    width: '28px',
    borderRadius: '4px 4px 0 0',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  chartBarLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    height: '16px',
  },
  tooltip: {
    position: 'absolute' as const,
    bottom: '100%',
    background: '#0f172a',
    color: '#ffffff',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '0.7rem',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    zIndex: 10,
    marginBottom: '4px',
  },
  chatsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  emptyState: {
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    marginTop: '40px',
    fontSize: '0.9rem',
  },
  chatRowLink: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '10px',
    background: '#ffffff',
    border: '1px solid var(--border-muted)',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
  },
  chatInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    overflow: 'hidden',
  },
  chatAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: '#e9edef',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#54656f',
    fontWeight: 500,
    fontSize: '0.95rem',
    flexShrink: 0,
  },
  chatContactName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  chatLastMessage: {
    fontSize: '0.78rem',
    color: '#667781',
    display: 'block',
    marginTop: '2px',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '180px',
  },
  chatMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '6px',
    flexShrink: 0,
  },
  chatTime: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
  },
};
