'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  Plus, 
  Upload, 
  X, 
  MapPin, 
  MessageSquare,
  Filter,
  CheckCircle2
} from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phone: string;
  ddd: string;
  city: string;
  state: string;
  region: string;
  type: 'ELEITOR' | 'MILITANTE';
  notes: string;
  created_at: string;
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterDDD, setFilterDDD] = useState('');
  const [filterState, setFilterState] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // New Contact form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState(''); // e.g. +5511999999999
  const [newType, setNewType] = useState<'ELEITOR' | 'MILITANTE'>('ELEITOR');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // CSV upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvProgress, setCsvProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setIsAuthenticated(true);
    }
    checkAuth();
  }, [router]);

  // Fetch contacts with filters
  const fetchContacts = async () => {
    setLoading(true);
    try {
      let query = supabase.from('contacts').select('*');

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      if (filterType !== 'ALL') {
        query = query.eq('type', filterType);
      }
      if (filterDDD) {
        query = query.eq('ddd', filterDDD);
      }
      if (filterState) {
        query = query.eq('state', filterState.toUpperCase());
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) throw error;
      setContacts(data as Contact[] || []);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchContacts();
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      fetchContacts();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [isAuthenticated, search, filterType, filterDDD, filterState]);

  // Manual Creation
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Prepend + if not present
    let formattedPhone = newPhone.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    // Basic Brazilian phone parser (e.g. +5511999999999 or +5521999999999)
    let ddd = '99';
    const digitsOnly = formattedPhone.replace(/\D/g, '');
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 4) {
      ddd = digitsOnly.substring(2, 4);
    } else if (digitsOnly.length >= 2) {
      ddd = digitsOnly.substring(0, 2);
    }

    try {
      const { error } = await supabase.from('contacts').insert({
        name: newName,
        phone: formattedPhone,
        ddd,
        city: newCity || null,
        state: newState.toUpperCase() || null,
        region: newRegion || null,
        type: newType,
        notes: newNotes || null,
      });

      if (error) throw error;

      setIsAddModalOpen(false);
      resetForm();
      fetchContacts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar o contato.');
    }
  };

  // CSV Import Parser
  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setErrorMsg('');
    setCsvProgress('Lendo arquivo CSV...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setErrorMsg('Arquivo vazio ou inválido.');
        return;
      }

      // Parse CSV lines
      const lines = text.split(/\r?\n/);
      if (lines.length <= 1) {
        setErrorMsg('O CSV deve conter pelo menos um cabeçalho e uma linha de dados.');
        return;
      }

      // Read Header: name,phone,type,city,state,region,notes
      const headers = lines[0].toLowerCase().split(/[;,]/).map(h => h.trim());
      const contactsToInsert = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Support semi-colons or commas
        const cols = line.split(/[;,]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 2) continue;

        // Map column indexes
        const nameIdx = headers.indexOf('nome');
        const phoneIdx = headers.indexOf('telefone');
        const typeIdx = headers.indexOf('tipo');
        const cityIdx = headers.indexOf('cidade');
        const stateIdx = headers.indexOf('estado');
        const regionIdx = headers.indexOf('regiao');
        const notesIdx = headers.indexOf('observacoes');

        const name = cols[nameIdx] || 'Contato Importado';
        let rawPhone = cols[phoneIdx] || '';
        
        if (!rawPhone) continue;

        // Format Phone to E.164
        let formattedPhone = rawPhone;
        if (!formattedPhone.startsWith('+')) {
          formattedPhone = `+${formattedPhone}`;
        }
        const digitsOnly = formattedPhone.replace(/\D/g, '');
        let ddd = '99';
        if (digitsOnly.startsWith('55') && digitsOnly.length >= 4) {
          ddd = digitsOnly.substring(2, 4);
        }

        const type = (cols[typeIdx]?.toUpperCase() === 'MILITANTE') ? 'MILITANTE' : 'ELEITOR';
        const city = cols[cityIdx] || null;
        const state = cols[stateIdx]?.toUpperCase() || null;
        const region = cols[regionIdx] || null;
        const notes = cols[notesIdx] || null;

        contactsToInsert.push({
          name,
          phone: formattedPhone,
          ddd,
          city,
          state,
          region,
          type,
          notes,
        });
      }

      if (contactsToInsert.length === 0) {
        setErrorMsg('Nenhum contato válido encontrado para importação.');
        return;
      }

      setCsvProgress(`Importando ${contactsToInsert.length} contatos no Supabase...`);

      try {
        const { error } = await supabase.from('contacts').insert(contactsToInsert);
        if (error) throw error;

        setCsvProgress('Importação realizada com sucesso!');
        setTimeout(() => {
          setIsCsvModalOpen(false);
          setCsvFile(null);
          setCsvProgress('');
          fetchContacts();
        }, 1500);
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao realizar inserção em lote.');
        setCsvProgress('');
      }
    };

    reader.onerror = () => {
      setErrorMsg('Falha ao ler o arquivo.');
    };

    reader.readAsText(csvFile);
  };

  // Start WhatsApp Conversation Action
  const handleStartChat = async (contact: Contact) => {
    try {
      // 1. Fetch active WABA numbers
      const { data: wabaNumbers, error: wabaError } = await supabase
        .from('whatsapp_numbers')
        .select('id')
        .eq('active', true)
        .limit(1);

      if (wabaError || !wabaNumbers || wabaNumbers.length === 0) {
        alert('Nenhum número de WhatsApp ativo configurado no CRM. Vá em Configurações para cadastrar.');
        return;
      }

      const wabaNumberId = wabaNumbers[0].id;

      // 2. Try to get or create conversation
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('whatsapp_number_id', wabaNumberId)
        .maybeSingle();

      if (existingConv) {
        // Reopen in case it is closed
        await supabase
          .from('conversations')
          .update({ status: 'open' })
          .eq('id', existingConv.id);

        router.push(`/inbox?contactId=${contact.id}`);
        return;
      }

      // Create new conversation
      const { error: insertError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contact.id,
          whatsapp_number_id: wabaNumberId,
          status: 'open',
        });

      if (insertError) throw insertError;

      router.push(`/inbox?contactId=${contact.id}`);
    } catch (err) {
      console.error('Error starting conversation:', err);
      alert('Não foi possível iniciar a conversa.');
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewPhone('');
    setNewType('ELEITOR');
    setNewCity('');
    setNewState('');
    setNewRegion('');
    setNewNotes('');
  };

  return (
    <div style={styles.container}>
      
      {/* Upper header action area */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Eleitores</h2>
          <p style={styles.subtitle}>Cadastrados automaticamente quando entram em contato pelo WhatsApp</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setIsCsvModalOpen(true)} className="btn btn-secondary">
            <Upload size={18} />
            <span>Importar CSV</span>
          </button>
          <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary">
            <Plus size={18} />
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="glass-panel" style={styles.filterBar}>
        <div style={styles.searchWrapper}>
          <Search size={18} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ paddingLeft: '38px' }}
          />
        </div>
        
        <div style={styles.filtersGroup}>
          <div style={styles.filterSelectWrapper}>
            <Filter size={16} style={styles.filterIcon} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="input-field"
              style={styles.filterSelect}
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="ELEITOR">Apenas Eleitores</option>
              <option value="MILITANTE">Apenas Militantes</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="DDD"
            value={filterDDD}
            onChange={(e) => setFilterDDD(e.target.value.replace(/\D/g, ''))}
            className="input-field"
            style={styles.filterDddInput}
            maxLength={2}
          />

          <input
            type="text"
            placeholder="Estado (Ex: SP)"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="input-field"
            style={styles.filterStateInput}
            maxLength={2}
          />
        </div>
      </div>

      {/* Contacts List Grid */}
      <div className="glass-panel scroll-on-hover" style={styles.tablePanel}>
        {loading ? (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Telefone</th>
                <th style={styles.th}>DDD</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Localidade</th>
                <th style={styles.th}>Observações</th>
                <th style={styles.thAction}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((row) => (
                <tr key={row} style={styles.tableRow}>
                  <td style={styles.tdName}>
                    <div className="skeleton" style={{ width: '130px', height: '14px', borderRadius: '4px' }}></div>
                  </td>
                  <td style={styles.td}>
                    <div className="skeleton" style={{ width: '110px', height: '12px', borderRadius: '4px' }}></div>
                  </td>
                  <td style={styles.td}>
                    <div className="skeleton" style={{ width: '24px', height: '18px', borderRadius: '4px' }}></div>
                  </td>
                  <td style={styles.td}>
                    <div className="skeleton" style={{ width: '65px', height: '18px', borderRadius: '9999px' }}></div>
                  </td>
                  <td style={styles.td}>
                    <div className="skeleton" style={{ width: '120px', height: '12px', borderRadius: '4px' }}></div>
                  </td>
                  <td style={styles.tdNotes}>
                    <div className="skeleton" style={{ width: '160px', height: '12px', borderRadius: '4px' }}></div>
                  </td>
                  <td style={styles.tdAction}>
                    <div className="skeleton" style={{ width: '85px', height: '28px', borderRadius: '6px' }}></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : contacts.length === 0 ? (
          <div style={styles.emptyState}>
            <Users size={48} color="var(--text-muted)" />
            <p style={{ marginTop: '12px' }}>Nenhum contato encontrado com os filtros selecionados.</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Telefone</th>
                <th style={styles.th}>DDD</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Localidade</th>
                <th style={styles.th}>Observações</th>
                <th style={styles.thAction}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} style={styles.tableRow}>
                  <td style={styles.tdName}>{contact.name}</td>
                  <td style={styles.td}>{contact.phone}</td>
                  <td style={styles.td}><span style={styles.dddTag}>{contact.ddd}</span></td>
                  <td style={styles.td}>
                    <span className={`badge badge-${contact.type.toLowerCase()}`}>
                      {contact.type}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {contact.city && (
                      <div style={styles.localWrapper}>
                        <MapPin size={14} color="var(--text-muted)" />
                        <span>{contact.city} - {contact.state}</span>
                      </div>
                    )}
                  </td>
                  <td style={styles.tdNotes}>{contact.notes || '-'}</td>
                  <td style={styles.tdAction}>
                    <button 
                      onClick={() => handleStartChat(contact)} 
                      style={styles.actionBtn}
                      title="Abrir no Chat"
                    >
                      <MessageSquare size={16} />
                      <span>Conversar</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL: Add New Contact */}
      {isAddModalOpen && (
        <div style={modalStyles.overlay}>
          <div className="glass-panel" style={modalStyles.content}>
            <div style={modalStyles.header}>
              <h3>Cadastrar Novo Contato</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={modalStyles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            
            {errorMsg && <div className="btn-danger" style={modalStyles.errorBox}>{errorMsg}</div>}

            <form onSubmit={handleAddContact} style={modalStyles.form}>
              <div style={modalStyles.formRow}>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Nome completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Telefone (E.164)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: +5511999999999"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div style={modalStyles.formRow}>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Tipo de Vinculo</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="input-field"
                    style={{ appearance: 'none', background: '#ffffff' }}
                  >
                    <option value="ELEITOR">Eleitor</option>
                    <option value="MILITANTE">Militante</option>
                  </select>
                </div>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Cidade</label>
                  <input
                    type="text"
                    placeholder="Cidade"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div style={modalStyles.formRow}>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Estado (Ex: SP)</label>
                  <input
                    type="text"
                    placeholder="UF"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    className="input-field"
                    maxLength={2}
                  />
                </div>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Região</label>
                  <input
                    type="text"
                    placeholder="Ex: Zona Norte, Centro"
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Observações (Histórico/Detalhes)</label>
                <textarea
                  placeholder="Notas adicionais sobre o eleitor/militante..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="input-field"
                  style={{ height: '80px', resize: 'vertical' }}
                />
              </div>

              <div style={modalStyles.actions}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Import CSV */}
      {isCsvModalOpen && (
        <div style={modalStyles.overlay}>
          <div className="glass-panel" style={modalStyles.content}>
            <div style={modalStyles.header}>
              <h3>Importação de Planilha (CSV)</h3>
              <button onClick={() => setIsCsvModalOpen(false)} style={modalStyles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            
            {errorMsg && <div className="btn-danger" style={modalStyles.errorBox}>{errorMsg}</div>}
            {csvProgress && (
              <div style={modalStyles.progressBox}>
                <CheckCircle2 size={16} />
                <span>{csvProgress}</span>
              </div>
            )}

            <div style={modalStyles.csvInstructions}>
              <p>O seu arquivo CSV deve ser delimitado por vírgula (<code>,</code>) ou ponto e vírgula (<code>;</code>) e conter os seguintes cabeçalhos:</p>
              <pre style={modalStyles.codeBlock}>
                nome, telefone, tipo, cidade, estado, regiao, observacoes
              </pre>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                * Exemplo de linha: João Silva, 5511999999999, ELEITOR, São Paulo, SP, Centro, Militante ativo na região central.
              </p>
            </div>

            <form onSubmit={handleCsvImport} style={modalStyles.form}>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Selecione o arquivo .csv</label>
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="input-field"
                  style={{ padding: '8px' }}
                />
              </div>

              <div style={modalStyles.actions}>
                <button type="button" onClick={() => setIsCsvModalOpen(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={!csvFile || !!csvProgress}>
                  Realizar Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    boxSizing: 'border-box' as const,
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
  filterBar: {
    padding: '16px 24px',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '16px',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchWrapper: {
    position: 'relative' as const,
    flex: 1,
    minWidth: '280px',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute' as const,
    left: '12px',
    color: 'var(--text-muted)',
  },
  filtersGroup: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  filterSelectWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  filterIcon: {
    position: 'absolute' as const,
    left: '12px',
    color: 'var(--text-muted)',
    pointerEvents: 'none' as const,
  },
  filterSelect: {
    paddingLeft: '36px',
    width: '180px',
    appearance: 'none' as const,
    background: '#ffffff',
  },
  filterDddInput: {
    width: '60px',
    textAlign: 'center' as const,
  },
  filterStateInput: {
    width: '120px',
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
  },
  tablePanel: {
    padding: '12px 0px',
    overflowX: 'auto' as const,
    overflowY: 'auto' as const,
    flex: 1,
  },
  tableLoading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    padding: '40px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px',
    color: 'var(--text-muted)',
    fontSize: '0.95rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    textAlign: 'left' as const,
  },
  tableHeaderRow: {
    borderBottom: '1px solid var(--border-muted)',
  },
  th: {
    padding: '16px 24px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  thAction: {
    padding: '16px 24px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'right' as const,
  },
  tableRow: {
    borderBottom: '1px solid var(--border-muted)',
    transition: 'background 0.2s',
  },
  tdName: {
    padding: '16px 24px',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  td: {
    padding: '16px 24px',
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
  },
  tdNotes: {
    padding: '16px 24px',
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tdAction: {
    padding: '16px 24px',
    textAlign: 'right' as const,
  },
  dddTag: {
    background: 'var(--bg-base)',
    padding: '2px 8px',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontWeight: 500,
    border: '1px solid var(--border-muted)',
  },
  localWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  actionBtn: {
    background: 'rgba(79, 70, 229, 0.06)',
    border: '1px solid rgba(79, 70, 229, 0.15)',
    borderRadius: '6px',
    color: 'var(--primary)',
    cursor: 'pointer',
    padding: '6px 12px',
    fontSize: '0.8rem',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  },
};

const modalStyles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  content: {
    width: '100%',
    maxWidth: '600px',
    padding: '32px',
    boxSizing: 'border-box' as const,
    background: '#ffffff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  errorBox: {
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '0.85rem',
    textAlign: 'center' as const,
  },
  progressBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px',
    borderRadius: '6px',
    background: 'var(--success-glass)',
    color: 'var(--success)',
    marginBottom: '16px',
    fontSize: '0.85rem',
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
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
  },
  csvInstructions: {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-muted)',
    padding: '16px',
    borderRadius: '8px',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  codeBlock: {
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-muted)',
    padding: '8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    overflowX: 'auto' as const,
  },
};
