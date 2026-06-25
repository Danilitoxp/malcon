'use client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { 
  Settings,
  Plus,
  UserCheck,
  Smartphone,
  ShieldAlert,
  Key,
  Shield,
  Activity,
  RefreshCw,
  LogOut,
  CheckCircle2
} from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  role: 'admin' | 'agent';
  created_at: string;
}

interface WhatsappNumber {
  id: string;
  name: string;
  phone_number: string;
  phone_number_id: string;
  waba_id: string | null;
  active: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  
  // Lists data state
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsappNumber[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [savingWaba, setSavingWaba] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Register Waba form state
  const [wabaName, setWabaName] = useState('');
  const [wabaPhone, setWabaPhone] = useState('');
  const [wabaPhoneId, setWabaPhoneId] = useState('');
  const [wabaWabaId, setWabaWabaId] = useState('');
  const [wabaToken, setWabaToken] = useState('');

  // Integration Toggle
  const [integrationType, setIntegrationType] = useState<'evolution' | 'meta'>('evolution');

  // Evolution API state
  const [evoStatus, setEvoStatus] = useState<any>(null);
  const [evoLoading, setEvoLoading] = useState(true);
  const [evoSyncing, setEvoSyncing] = useState(false);
  const [evoError, setEvoError] = useState('');
  const [evoSuccess, setEvoSuccess] = useState('');
  const [evoQrCode, setEvoQrCode] = useState<string>('');
  const [evoQrLoading, setEvoQrLoading] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncLabel, setSyncLabel] = useState<string>('');
  const [evoSetupDone, setEvoSetupDone] = useState<boolean>(false);
  const [evoSettingUp, setEvoSettingUp] = useState<boolean>(false);

  useEffect(() => {
    async function initSettings() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Fetch user profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (userProfile) {
        setCurrentUser(userProfile as Profile);
      }

      await loadSettingsData();
    }
    initSettings();
  }, [router]);

  const loadSettingsData = async () => {
    setLoading(true);
    setEvoLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Load Supabase data and Evolution status in parallel
    const [teamRes, wabaRes] = await Promise.all([
      supabase.from('profiles').select('*').order('name', { ascending: true }),
      supabase.from('whatsapp_numbers').select('id, name, phone_number, phone_number_id, waba_id, active'),
    ]);

    if (teamRes.data) setTeam(teamRes.data as Profile[]);
    if (wabaRes.data) setWhatsappNumbers(wabaRes.data as WhatsappNumber[]);
    setLoading(false); // show team/numbers immediately

    // Load Evolution status in background — doesn't block the page render
    if (token) {
      try {
        const evoRes = await fetch(`${BACKEND_URL}/api/whatsapp/evolution/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (evoRes.ok) setEvoStatus(await evoRes.json());
      } catch (err) {
        console.error('Error fetching Evolution status:', err);
      }
    }
    setEvoLoading(false);
  };

  const loadEvolutionQrCode = async () => {
    setEvoQrLoading(true);
    setEvoError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${BACKEND_URL}/api/whatsapp/evolution/connect`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Falha ao gerar o QR Code da Evolution API.');
      }

      const data = await res.json();
      const codeBase64 = data?.qrcode?.base64 || data?.base64;
      if (codeBase64) {
        setEvoQrCode(codeBase64);
      } else {
        setEvoQrCode('');
      }
    } catch (err: any) {
      console.error('Error fetching Evolution QR:', err);
      setEvoError('Não foi possível carregar o QR Code. Certifique-se de que a instância da Evolution API está criada.');
    } finally {
      setEvoQrLoading(false);
    }
  };

  // Poll connection status & auto-sync — only runs AFTER setup is done
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (integrationType === 'evolution' && evoStatus?.status === 'disconnected' && !evoSyncing && evoSetupDone) {
      if (!evoQrCode && !evoQrLoading) {
        loadEvolutionQrCode();
      }

      interval = setInterval(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) return;

          const res = await fetch(`${BACKEND_URL}/api/whatsapp/evolution/status`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (res.ok) {
            const statusData = await res.json();
            if (statusData.status === 'connected') {
              setEvoStatus(statusData);
              clearInterval(interval);
              
              // Trigger auto synchronization with animated progress bar
              setEvoSyncing(true);
              setSyncProgress(0);
              setSyncLabel('Conectando ao WhatsApp...');

              // Animate progress bar while sync runs in background
              const steps = [
                { pct: 15, label: 'Autenticando instância...', delay: 400 },
                { pct: 30, label: 'Buscando conversas...', delay: 800 },
                { pct: 50, label: 'Importando contatos...', delay: 1400 },
                { pct: 65, label: 'Carregando mensagens...', delay: 2200 },
                { pct: 80, label: 'Salvando no banco de dados...', delay: 3200 },
                { pct: 90, label: 'Finalizando sincronização...', delay: 4000 },
              ];
              steps.forEach(({ pct, label, delay }) => {
                setTimeout(() => {
                  setSyncProgress(pct);
                  setSyncLabel(label);
                }, delay);
              });

              const syncRes = await fetch(`${BACKEND_URL}/api/whatsapp/evolution/sync`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
              });

              if (syncRes.ok) {
                setSyncProgress(100);
                setSyncLabel('Concluído!');
                setTimeout(() => router.push('/inbox'), 1200);
              } else {
                setSyncProgress(100);
                setEvoError('WhatsApp conectado, mas a configuração inicial falhou. Tente recarregar a página.');
              }
              setEvoSyncing(false);
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [integrationType, evoStatus, evoQrCode, evoSetupDone]);

  const handleSetupEvolution = async () => {
    setEvoSettingUp(true);
    setEvoError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sessão expirada.');

      const res = await fetch(`${BACKEND_URL}/api/whatsapp/evolution/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao configurar instância.');
      }
      setEvoSetupDone(true);
      // QR code will be auto-loaded by the polling useEffect
    } catch (err: any) {
      setEvoError(err.message || 'Erro ao configurar a integração.');
    } finally {
      setEvoSettingUp(false);
    }
  };

  const handleSyncEvolution = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setEvoError('');
    setEvoSuccess('');
    setEvoSyncing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Sessão expirada. Refaça login.');

      const res = await fetch(`${BACKEND_URL}/api/whatsapp/evolution/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Falha ao sincronizar com a Evolution API.');
      }

      setEvoSuccess('Sincronização concluída! Novas mensagens serão recebidas automaticamente.');
      
      await loadSettingsData();
    } catch (err: any) {
      setEvoError(err.message || 'Erro de conexão com o gateway backend.');
    } finally {
      setEvoSyncing(false);
    }
  };

  // Submit new WhatsApp number to NestJS API
  const handleSaveWaba = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSavingWaba(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Sessão expirada. Refaça login.');

      const res = await fetch(`${BACKEND_URL}/api/whatsapp-numbers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: wabaName,
          phoneNumberId: wabaPhoneId,
          phoneNumber: wabaPhone,
          wabaId: wabaWabaId || undefined,
          accessToken: wabaToken
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Falha ao registrar número.');
      }

      setSuccessMsg('Número de WhatsApp registrado e ativado com sucesso!');
      resetWabaForm();
      await loadSettingsData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão com o gateway backend.');
    } finally {
      setSavingWaba(false);
    }
  };

  const resetWabaForm = () => {
    setWabaName('');
    setWabaPhone('');
    setWabaPhoneId('');
    setWabaWabaId('');
    setWabaToken('');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        {/* Settings Title Header Skeleton */}
        <div style={styles.header}>
          <div>
            <div className="skeleton" style={{ width: '160px', height: '28px', borderRadius: '6px' }}></div>
            <div className="skeleton" style={{ width: '380px', height: '16px', borderRadius: '4px', marginTop: '8px' }}></div>
          </div>
        </div>

        <div style={styles.layoutGrid}>
          {/* Left Side: WhatsApp config Skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={styles.sectionCard}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton" style={{ width: '240px', height: '20px', borderRadius: '4px' }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                {[1, 2].map((i) => (
                  <div key={i} style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '70%' }}>
                      <div className="skeleton" style={{ width: '40%', height: '14px', borderRadius: '4px', marginBottom: '8px' }}></div>
                      <div className="skeleton" style={{ width: '80%', height: '10px', borderRadius: '4px' }}></div>
                    </div>
                    <div className="skeleton" style={{ width: '60px', height: '18px', borderRadius: '4px' }}></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel" style={styles.sectionCard}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
                <div className="skeleton" style={{ width: '260px', height: '20px', borderRadius: '4px' }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div className="skeleton" style={{ width: '70%', height: '10px', borderRadius: '4px', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ width: '100%', height: '36px', borderRadius: '8px' }}></div>
                  </div>
                  <div>
                    <div className="skeleton" style={{ width: '50%', height: '10px', borderRadius: '4px', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ width: '100%', height: '36px', borderRadius: '8px' }}></div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div className="skeleton" style={{ width: '60%', height: '10px', borderRadius: '4px', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ width: '100%', height: '36px', borderRadius: '8px' }}></div>
                  </div>
                  <div>
                    <div className="skeleton" style={{ width: '60%', height: '10px', borderRadius: '4px', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ width: '100%', height: '36px', borderRadius: '8px' }}></div>
                  </div>
                </div>
                <div>
                  <div className="skeleton" style={{ width: '40%', height: '10px', borderRadius: '4px', marginBottom: '8px' }}></div>
                  <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '8px' }}></div>
                </div>
                <div className="skeleton" style={{ width: '100%', height: '40px', borderRadius: '8px' }}></div>
              </div>
            </div>
          </div>

          {/* Right Side: Team Skeleton */}
          <div className="glass-panel" style={styles.sectionCard}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '4px' }}></div>
              <div className="skeleton" style={{ width: '160px', height: '20px', borderRadius: '4px' }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 }}></div>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '50%', height: '12px', borderRadius: '4px', marginBottom: '6px' }}></div>
                    <div className="skeleton" style={{ width: '70%', height: '10px', borderRadius: '4px' }}></div>
                  </div>
                  <div className="skeleton" style={{ width: '70px', height: '24px', borderRadius: '6px' }}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div style={styles.container}>
      
      {/* Settings Title Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Configurações</h2>
          <p style={styles.subtitle}>Gerencie números oficiais de atendimento e usuários da equipe</p>
        </div>
      </div>

      <div style={styles.layoutGrid}>
        
        {/* Left Side: WhatsApp config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Integration Type Switcher */}
          <div className="glass-panel" style={{ padding: '6px', display: 'flex', gap: '6px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid var(--border-muted)' }}>
            <button
              onClick={() => {
                setIntegrationType('evolution');
                setEvoError('');
                setEvoSuccess('');
              }}
              style={{
                flex: 1,
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: integrationType === 'evolution' ? 'var(--primary)' : 'transparent',
                color: integrationType === 'evolution' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <img 
                src="https://meta-q.cdn.bubble.io/f1735656025985x589899456761148800/evolution-logo.png" 
                alt="Evolution"
                style={{ width: '16px', height: '16px', objectFit: 'contain' }} 
              />
              Evolution API
            </button>
            <button
              onClick={() => {
                setIntegrationType('meta');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              style={{
                flex: 1,
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: integrationType === 'meta' ? 'var(--primary)' : 'transparent',
                color: integrationType === 'meta' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Smartphone size={14} />
              WhatsApp API (Meta)
            </button>
          </div>

          {/* META INTEGRATION VIEW */}
          {integrationType === 'meta' && (
            <>
              {/* Active WABA Numbers list */}
              <div className="glass-panel" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <Smartphone size={20} color="var(--primary)" />
                  <h3 style={styles.sectionTitle}>Canais de WhatsApp Conectados</h3>
                </div>
                
                <div style={styles.wabaList}>
                  {whatsappNumbers.length === 0 ? (
                    <p style={styles.emptyText}>Nenhum canal de WhatsApp conectado no momento.</p>
                  ) : (
                    whatsappNumbers.map((waba) => (
                      <div key={waba.id} style={styles.wabaRow}>
                        <div>
                          <h4 style={styles.wabaRowName}>{waba.name}</h4>
                          <p style={styles.wabaRowDetails}>
                            Telefone: <strong>{waba.phone_number}</strong> | Phone ID: <code>{waba.phone_number_id}</code>
                          </p>
                        </div>
                        <div style={styles.wabaRowStatus}>
                          <Activity size={14} color={waba.active ? 'var(--success)' : 'var(--text-muted)'} />
                          <span style={waba.active ? { color: 'var(--success)', fontWeight: 600 } : {}} >
                            {waba.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ADD WhatsApp Number Form (ADMIN ONLY) */}
              <div className="glass-panel" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <Key size={20} color="var(--primary)" />
                  <h3 style={styles.sectionTitle}>Conectar Novo Canal Oficial (Meta)</h3>
                </div>

                {isAdmin ? (
                  <form onSubmit={handleSaveWaba} style={styles.form}>
                    
                    {errorMsg && <div className="btn-danger" style={styles.alertBox}>{errorMsg}</div>}
                    {successMsg && <div style={{ ...styles.alertBox, background: 'var(--success-glass)', color: 'var(--success)' }}>{successMsg}</div>}

                    <div style={styles.formRow}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Identificador do Canal (Ex: Suporte Financeiro)</label>
                        <input
                          type="text"
                          required
                          placeholder="Nome do Canal"
                          value={wabaName}
                          onChange={(e) => setWabaName(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Número de Telefone (E.164)</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: +5511999999999"
                          value={wabaPhone}
                          onChange={(e) => setWabaPhone(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div style={styles.formRow}>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Meta Phone Number ID</label>
                        <input
                          type="text"
                          required
                          placeholder="ID do Telefone na Meta"
                          value={wabaPhoneId}
                          onChange={(e) => setWabaPhoneId(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div style={styles.formGroup}>
                        <label style={styles.label}>Meta WABA Account ID (Opcional)</label>
                        <input
                          type="text"
                          placeholder="ID da Conta Business"
                          value={wabaWabaId}
                          onChange={(e) => setWabaWabaId(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Meta Cloud API Access Token (Temporário de 23h ou Permanente)</label>
                      <textarea
                        required
                        placeholder="Cole o token de acesso EAAB..."
                        value={wabaToken}
                        onChange={(e) => setWabaToken(e.target.value)}
                        className="input-field"
                        style={{ height: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={savingWaba}
                      style={{ width: '100%', marginTop: '10px' }}
                    >
                      {savingWaba ? 'Registrando e Criptografando...' : 'Salvar e Conectar Canal'}
                    </button>
                  </form>
                ) : (
                  <div style={styles.restrictedBox}>
                    <ShieldAlert size={28} color="#f87171" />
                    <p>Apenas administradores podem registrar e modificar credenciais de WhatsApp Business API.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* EVOLUTION API INTEGRATION VIEW */}
          {integrationType === 'evolution' && (
            <div className="glass-panel" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <img 
                  src="https://meta-q.cdn.bubble.io/f1735656025985x589899456761148800/evolution-logo.png" 
                  alt="Evolution Logo"
                  style={{ width: '22px', height: '22px', objectFit: 'contain' }} 
                />
                <h3 style={styles.sectionTitle}>Integração Evolution API</h3>
              </div>

              {evoLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
                  <RefreshCw className="animate-spin" size={24} color="var(--primary)" />
                  <span style={{ marginLeft: '12px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                    Carregando status da Evolution API...
                  </span>
                </div>
              ) : evoStatus && evoStatus.configured ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '10px 0', width: '100%' }}>
                  
                  {evoStatus.status === 'connected' ? (
                    /* CONNECTED STATE */
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                      {/* Main profile card */}
                      <div style={{
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(22, 163, 74, 0.12)',
                        padding: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                      }}>
                        {/* Avatar */}
                        <div style={{ flexShrink: 0, position: 'relative' }}>
                          {evoStatus.profilePicUrl ? (
                            <img
                              src={evoStatus.profilePicUrl}
                              alt="Foto de perfil WhatsApp"
                              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#ffffff', border: '1px solid var(--border-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                              <img 
                                src="https://meta-q.cdn.bubble.io/f1735656025985x589899456761148800/evolution-logo.png" 
                                alt="Evolution Logo"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                            </div>
                          )}
                          {/* Online dot */}
                          <span style={{
                            position: 'absolute', bottom: '2px', right: '2px',
                            width: '14px', height: '14px', borderRadius: '50%',
                            background: 'var(--success)', border: '2px solid white'
                          }} />
                        </div>

                        {/* Name + number + status */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <CheckCircle2 size={15} color="var(--success)" />
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conectado</span>
                          </div>
                          <p style={{ margin: '0 0 2px 0', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {evoStatus.profileName || evoStatus.instanceName || 'WhatsApp'}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {evoStatus.owner || 'Número não identificado'}
                          </p>
                        </div>

                        {/* Logout button */}
                        {isAdmin && (
                          <button
                            title="Desconectar instância"
                            style={{
                              flexShrink: 0,
                              background: 'transparent',
                              border: '1px solid rgba(220,38,38,0.2)',
                              borderRadius: '8px',
                              padding: '8px 10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: 'var(--danger, #dc2626)',
                              fontSize: '0.82rem',
                              fontWeight: 500,
                              transition: 'all 0.15s',
                            }}
                            onClick={async () => {
                              if (!confirm('Tem certeza que deseja desconectar o WhatsApp desta instância?')) return;
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                await fetch(`${BACKEND_URL}/api/whatsapp/evolution/logout`, {
                                  method: 'DELETE',
                                  headers: { 'Authorization': `Bearer ${session?.access_token}` },
                                });
                                setEvoQrCode('');
                                await loadSettingsData();
                              } catch (err) {
                                console.error('Logout error:', err);
                              }
                            }}
                          >
                            <LogOut size={14} />
                            Sair
                          </button>
                        )}
                      </div>

                      {evoSuccess && (
                        <div style={{ ...styles.alertBox, background: 'var(--success-glass)', color: 'var(--success)', fontSize: '0.85rem' }}>
                          {evoSuccess}
                        </div>
                      )}

                      {evoError && (
                        <div className="btn-danger" style={styles.alertBox}>
                          {evoError}
                        </div>
                      )}

                    </div>
                  ) : (
                    /* DISCONNECTED STATE — 3 steps: Setup → QR → Progress */
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>

                      {!evoSetupDone ? (
                        /* ── STEP 1: Iniciar Integração ── */
                        <div style={{
                          width: '100%',
                          background: 'linear-gradient(135deg, #f5f3ff 0%, #f8fafc 100%)',
                          border: '1px solid rgba(109,40,217,0.1)',
                          borderRadius: '14px',
                          padding: '28px 24px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '16px',
                          textAlign: 'center',
                        }}>
                          <div style={{
                            width: '56px', height: '56px', borderRadius: '16px',
                            background: '#ffffff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
                            padding: '12px',
                            border: '1px solid var(--border-bright)'
                          }}>
                            <img 
                              src="https://meta-q.cdn.bubble.io/f1735656025985x589899456761148800/evolution-logo.png" 
                              alt="Evolution Logo"
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                          </div>
                          <div>
                            <p style={{ margin: '0 0 6px 0', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                              Conectar WhatsApp
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              Clique abaixo para configurar a instância e gerar o QR Code de conexão.
                            </p>
                          </div>

                          {evoError && (
                            <div className="btn-danger" style={{ ...styles.alertBox, width: '100%', fontSize: '0.85rem' }}>
                              {evoError}
                            </div>
                          )}

                          <button
                            onClick={handleSetupEvolution}
                            className="btn btn-primary"
                            disabled={evoSettingUp || !isAdmin}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.95rem', padding: '12px' }}
                          >
                            {evoSettingUp ? (
                              <>
                                <RefreshCw className="animate-spin" size={16} />
                                Configurando instância...
                              </>
                            ) : (
                              <>
                                <Smartphone size={16} />
                                Iniciar Integração
                              </>
                            )}
                          </button>
                          {!isAdmin && (
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Apenas administradores podem configurar a integração.
                            </p>
                          )}
                        </div>
                      ) : evoSyncing ? (
                        /* ── STEP 3: Progress bar ── */
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{
                            background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
                            border: '1px solid rgba(22,163,74,0.12)',
                            borderRadius: '10px',
                            padding: '16px 18px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {syncLabel || 'Iniciando...'}
                              </span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)' }}>
                                {syncProgress}%
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'rgba(22,163,74,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', width: `${syncProgress}%`,
                                background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                                borderRadius: '999px',
                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                              }} />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── STEP 2: QR Code ── */
                        <>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
                            Abra o WhatsApp → <strong>Aparelhos Conectados → Conectar um Aparelho</strong> e escaneie:
                          </p>

                          {evoQrLoading ? (
                            <div style={{ width: '260px', height: '260px', background: '#f8fafc', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '12px', border: '1px dashed var(--border-bright)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <RefreshCw className="animate-spin" size={28} color="var(--primary)" />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gerando QR Code...</span>
                              </div>
                            </div>
                          ) : evoQrCode ? (
                            /* Pure black QR code on white background */
                            <div style={{ 
                              background: '#ffffff', 
                              padding: '16px', 
                              borderRadius: '12px',
                              border: '1px solid var(--border-bright)',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                            }}>
                              <img
                                src={evoQrCode}
                                alt="QR Code de Conexão"
                                style={{ 
                                  width: '220px', 
                                  height: '220px', 
                                  display: 'block', 
                                  filter: 'grayscale(100%) contrast(1000%)' 
                                }}
                              />
                            </div>
                          ) : (
                            <div style={{ width: '260px', height: '260px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: '12px', border: '1px dashed var(--border-bright)', padding: '16px', textAlign: 'center' }}>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                O QR Code expirou. Clique em Recarregar.
                              </p>
                            </div>
                          )}

                          {evoSuccess && (
                            <div style={{ ...styles.alertBox, background: 'var(--success-glass)', color: 'var(--success)', fontSize: '0.9rem', width: '100%' }}>
                              ✓ {evoSuccess}
                            </div>
                          )}

                          {evoError && (
                            <div className="btn-danger" style={{ ...styles.alertBox, width: '100%' }}>
                              {evoError}
                            </div>
                          )}

                          <button
                            onClick={() => loadEvolutionQrCode()}
                            className="btn btn-secondary"
                            disabled={evoQrLoading}
                            style={{ width: '100%', fontSize: '0.85rem', padding: '8px 16px' }}
                          >
                            Recarregar QR Code
                          </button>
                        </>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div style={styles.restrictedBox}>
                  <ShieldAlert size={28} color="#f87171" />
                  <p>
                    Configuração da Evolution API não localizada no arquivo <code>.env</code> do backend (EVO_URL, EVO_API_KEY, EVO_INSTANCE).
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Side: Users and Permissions */}
        <div className="glass-panel" style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <UserCheck size={20} color="var(--primary)" />
            <h3 style={styles.sectionTitle}>Membros da Equipe</h3>
          </div>

          <div style={styles.teamList}>
            {team.map((member) => (
              <div key={member.id} style={styles.memberRow}>
                <div style={styles.memberAvatar}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={styles.memberName}>{member.name}</h4>
                  <p style={styles.memberDate}>
                    Membro desde: {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={styles.memberRoleBadge}>
                  <Shield size={12} color={member.role === 'admin' ? '#f59e0b' : '#94a3b8'} />
                  <span style={member.role === 'admin' ? { color: '#f59e0b', fontWeight: 600 } : {}}>
                    {member.role === 'admin' ? 'Admin' : 'Atendente'}
                  </span>
                </div>
              </div>
            ))}
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
    gap: '24px',
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
  },
  subtitle: {
    color: 'var(--text-secondary)',
    marginTop: '4px',
    fontSize: '0.95rem',
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '24px',
    alignItems: 'start',
  },
  sectionCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid var(--border-muted)',
    paddingBottom: '12px',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  wabaList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  wabaRow: {
    padding: '16px',
    borderRadius: '10px',
    background: 'var(--bg-base)',
    border: '1px solid var(--border-muted)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wabaRowName: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  wabaRowDetails: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    marginTop: '4px',
  },
  wabaRowStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
  },
  restrictedBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '12px',
    background: 'var(--danger-glass)',
    border: '1px solid rgba(220, 38, 38, 0.15)',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    textAlign: 'center' as const,
    fontSize: '0.9rem',
  },
  alertBox: {
    padding: '12px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    textAlign: 'center' as const,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  teamList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  memberRow: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: 'var(--bg-base)',
  },
  memberAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'var(--primary-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  memberName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  memberDate: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  memberRoleBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    background: 'var(--bg-surface)',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid var(--border-muted)',
  },
  emptyText: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    padding: '20px',
  },
};
