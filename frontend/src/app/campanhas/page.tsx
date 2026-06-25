'use client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import {
  Megaphone, Plus, Play, Pause, CheckCircle2, XCircle,
  Clock, Users, RefreshCw, X, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  message: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  delay_seconds: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  running: 'Enviando',
  paused: 'Pausado',
  completed: 'Concluído',
};

const STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8',
  running: '#3b82f6',
  paused: '#f59e0b',
  completed: '#22c55e',
};

const BR_STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export default function CampanhasPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formName, setFormName] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formDelay, setFormDelay] = useState(10);
  const [formTypes, setFormTypes] = useState<string[]>([]);
  const [formStates, setFormStates] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const loadCampaigns = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/campaigns`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) setCampaigns(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      setIsAdmin(profile?.role === 'admin');
      await loadCampaigns();
    }
    init();
  }, [router, loadCampaigns]);

  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(() => loadCampaigns(true), 3000);
    return () => clearInterval(interval);
  }, [campaigns, loadCampaigns]);

  const fetchPreview = async () => {
    if (!isAdmin || editingCampaign) return;
    setPreviewLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/campaigns/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ filters: { types: formTypes, states: formStates } }),
      });
      if (res.ok) setPreviewCount((await res.json()).count);
    } catch { setPreviewCount(null); }
    finally { setPreviewLoading(false); }
  };

  useEffect(() => {
    if (!showForm || editingCampaign) return;
    const t = setTimeout(fetchPreview, 400);
    return () => clearTimeout(t);
  }, [formTypes, formStates, showForm]);

  const openCreate = () => {
    setEditingCampaign(null);
    resetForm();
    setShowForm(true);
    setTimeout(fetchPreview, 100);
  };

  const openEdit = (c: Campaign) => {
    setEditingCampaign(c);
    setFormName(c.name);
    setFormMessage(c.message);
    setFormDelay(c.delay_seconds);
    setFormTypes([]);
    setFormStates([]);
    setPreviewCount(c.total_contacts);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);
    try {
      const token = await getToken();
      let res: Response;
      if (editingCampaign) {
        res = await fetch(`${BACKEND_URL}/api/campaigns/${editingCampaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: formName, message: formMessage, delaySeconds: formDelay }),
        });
      } else {
        res = await fetch(`${BACKEND_URL}/api/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            name: formName,
            message: formMessage,
            delaySeconds: formDelay,
            filters: { types: formTypes.length ? formTypes : undefined, states: formStates.length ? formStates : undefined },
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao salvar campanha.');
      setShowForm(false);
      resetForm();
      await loadCampaigns();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message);
      }
      setDeleteTarget(null);
      await loadCampaigns(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleStart = async (id: string) => {
    setActionLoading(id + '_start');
    const token = await getToken();
    await fetch(`${BACKEND_URL}/api/campaigns/${id}/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    setActionLoading(null);
    await loadCampaigns(true);
  };

  const handlePause = async (id: string) => {
    setActionLoading(id + '_pause');
    const token = await getToken();
    await fetch(`${BACKEND_URL}/api/campaigns/${id}/pause`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    setActionLoading(null);
    await loadCampaigns(true);
  };

  const resetForm = () => {
    setFormName(''); setFormMessage(''); setFormDelay(10);
    setFormTypes([]); setFormStates([]); setPreviewCount(null); setFormError('');
  };

  const toggleType = (t: string) =>
    setFormTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const isEditing = !!editingCampaign;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Campanhas</h2>
          <p style={styles.subtitle}>Envio em massa para eleitores via WhatsApp</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Nova Campanha
          </button>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div style={styles.modal} className="glass-panel" onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{isEditing ? 'Editar Campanha' : 'Nova Campanha'}</h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} style={styles.closeBtn}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {formError && <div style={styles.errorBox}>{formError}</div>}

              <div style={styles.field}>
                <label style={styles.label}>Nome da campanha</label>
                <input required className="input-field" placeholder="Ex: Campanha Junho 2026" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Mensagem <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({formMessage.length}/1000)</span></label>
                <textarea
                  required
                  className="input-field"
                  placeholder="Olá {nome}, temos novidades para você..."
                  value={formMessage}
                  onChange={e => setFormMessage(e.target.value.slice(0, 1000))}
                  style={{ height: '120px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Intervalo entre mensagens</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                  {[5, 10, 15, 20, 30].map(s => (
                    <button key={s} type="button" onClick={() => setFormDelay(s)} style={{
                      padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-muted)',
                      background: formDelay === s ? 'var(--primary)' : 'transparent',
                      color: formDelay === s ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                    }}>{s}s</button>
                  ))}
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Maior intervalo = menor risco de bloqueio pelo WhatsApp
                </p>
              </div>

              {!isEditing && (
                <>
                  <div style={styles.field}>
                    <label style={styles.label}>Filtrar por tipo de contato</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['ELEITOR', 'MILITANTE'].map(t => (
                        <button key={t} type="button" onClick={() => toggleType(t)} style={{
                          padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border-muted)',
                          background: formTypes.includes(t) ? 'var(--primary)' : 'transparent',
                          color: formTypes.includes(t) ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                        }}>{t}</button>
                      ))}
                      {formTypes.length > 0 && (
                        <button type="button" onClick={() => setFormTypes([])} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-muted)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Todos</button>
                      )}
                    </div>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Filtrar por estado (opcional)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
                      {BR_STATES.map(s => (
                        <button key={s} type="button" onClick={() => setFormStates(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} style={{
                          padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border-muted)',
                          background: formStates.includes(s) ? 'var(--primary)' : 'transparent',
                          color: formStates.includes(s) ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500,
                        }}>{s}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.15)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Users size={16} color="var(--success)" />
                    {previewLoading ? (
                      <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Calculando...</span>
                    ) : (
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--success)' }}>
                        {previewCount ?? '—'} contatos serão atingidos
                      </span>
                    )}
                  </div>
                </>
              )}

              {isEditing && (
                <div style={{ background: '#fffbeb', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.82rem', color: '#92400e' }}>
                  Os filtros de contatos não podem ser alterados após a criação.
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={formSubmitting || !formName || !formMessage} style={{ padding: '12px' }}>
                {formSubmitting ? <><RefreshCw className="animate-spin" size={15} /> Salvando...</> : isEditing ? 'Salvar Alterações' : 'Criar Campanha'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div style={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...styles.modal, maxWidth: '420px' }} className="glass-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={24} color="#dc2626" />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>Excluir campanha?</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  A campanha <strong>"{deleteTarget.name}"</strong> e todos os seus registros de contatos serão removidos permanentemente.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button className="btn btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => setDeleteTarget(null)}>
                  Cancelar
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  disabled={deleteLoading}
                  onClick={handleDelete}
                >
                  {deleteLoading ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-panel" style={{ padding: '20px' }}>
              <div className="skeleton" style={{ width: '40%', height: '16px', borderRadius: '4px', marginBottom: '12px' }} />
              <div className="skeleton" style={{ width: '70%', height: '10px', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Megaphone size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontWeight: 600, marginBottom: '4px' }}>Nenhuma campanha criada</p>
          <p style={{ fontSize: '0.88rem' }}>Crie sua primeira campanha de disparo em massa.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {campaigns.map(c => {
            const progress = c.total_contacts > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100) : 0;
            const isBusy = actionLoading === c.id + '_start' || actionLoading === c.id + '_pause';
            const canEdit = c.status === 'draft';
            const canDelete = c.status !== 'running';
            return (
              <div key={c.id} className="glass-panel" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{c.name}</h3>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
                        background: STATUS_COLOR[c.status] + '20', color: STATUS_COLOR[c.status],
                        textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                      }}>
                        {c.status === 'running' && <RefreshCw size={10} className="animate-spin" />}
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '500px' }}>
                      {c.message}
                    </p>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px', flexWrap: 'wrap' as const }}>
                      <span><Users size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />{c.total_contacts} contatos</span>
                      <span><CheckCircle2 size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle', color: '#22c55e' }} />{c.sent_count} enviados</span>
                      {c.failed_count > 0 && <span><XCircle size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle', color: '#ef4444' }} />{c.failed_count} falhas</span>}
                      <span><Clock size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />{c.delay_seconds}s intervalo</span>
                    </div>
                    {(c.status === 'running' || c.status === 'paused' || c.status === 'completed') && (
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Progresso</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: STATUS_COLOR[c.status] }}>{progress}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--border-muted)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${progress}%`,
                            background: c.status === 'completed' ? '#22c55e' : c.status === 'paused' ? '#f59e0b' : 'var(--primary)',
                            borderRadius: '999px', transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                      {(c.status === 'draft' || c.status === 'paused') && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '8px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                          disabled={isBusy}
                          onClick={() => handleStart(c.id)}
                        >
                          {isBusy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                          {c.status === 'paused' ? 'Retomar' : 'Iniciar'}
                        </button>
                      )}
                      {c.status === 'running' && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '8px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                          disabled={isBusy}
                          onClick={() => handlePause(c.id)}
                        >
                          {isBusy ? <RefreshCw size={14} className="animate-spin" /> : <Pause size={14} />}
                          Pausar
                        </button>
                      )}
                      {canEdit && (
                        <button
                          title="Editar"
                          onClick={() => openEdit(c)}
                          style={{ background: 'transparent', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          title="Excluir"
                          onClick={() => setDeleteTarget(c)}
                          style={{ background: 'transparent', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '32px', display: 'flex', flexDirection: 'column' as const, gap: '24px', height: '100vh', overflowY: 'auto' as const, boxSizing: 'border-box' as const },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.95rem' },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' },
  modal: { width: '100%', maxWidth: '560px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' as const, boxSizing: 'border-box' as const },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  closeBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' },
  errorBox: { background: 'var(--danger-glass)', border: '1px solid rgba(220,38,38,0.15)', color: 'var(--danger)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' },
};
