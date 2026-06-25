'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { MessageCircle, Mail, Lock, User, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'agent'>('agent');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to Dashboard
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    }
    checkUser();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up with User Metadata (read by PostgreSQL trigger to create profiles)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name || 'Novo Usuário',
              role: role,
            },
          },
        });

        if (error) throw error;
        
        if (data.user && data.session) {
          setSuccessMsg('Cadastro realizado e sessão iniciada com sucesso!');
          router.push('/');
        } else {
          setSuccessMsg('Cadastro realizado! Por favor, verifique seu e-mail para confirmar a conta.');
        }
      } else {
        // Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        
        router.push('/');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro ao processar sua solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginCard} className="glass-panel">
        
        {/* Brand Banner */}
        <div style={styles.header}>
          <div style={styles.logoCircle}>
            <MessageCircle size={32} color="#ffffff" />
          </div>
          <h1 style={styles.title}>CRM SaaS</h1>
          <p style={styles.subtitle}>Gestão de Relacionamento & WhatsApp</p>
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div style={styles.errorBox}>
            <span style={{ fontSize: '0.85rem' }}>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={styles.successBox}>
            <span style={{ fontSize: '0.85rem' }}>{successMsg}</span>
          </div>
        )}

        {/* Login/Signup Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {isSignUp && (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nome Completo</label>
                <div style={styles.inputWrapper}>
                  <User size={18} style={styles.inputIcon} />
                  <input
                    type="text"
                    required
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field"
                    style={styles.inputIndent}
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Perfil de Acesso</label>
                <div style={styles.inputWrapper}>
                  <ShieldCheck size={18} style={styles.inputIcon} />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'admin' | 'agent')}
                    className="input-field"
                    style={{ ...styles.inputIndent, appearance: 'none', background: '#ffffff' }}
                  >
                    <option value="agent">Atendente (Operador)</option>
                    <option value="admin">Administrador (Gestor)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>E-mail</label>
            <div style={styles.inputWrapper}>
              <Mail size={18} style={styles.inputIcon} />
              <input
                type="email"
                required
                placeholder="exemplo@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                style={styles.inputIndent}
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Senha</label>
            <div style={styles.inputWrapper}>
              <Lock size={18} style={styles.inputIcon} />
              <input
                type="password"
                required
                placeholder="******"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                style={styles.inputIndent}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: '10px' }}
          >
            {loading ? 'Processando...' : isSignUp ? 'Criar Conta' : 'Entrar no Sistema'}
          </button>
        </form>

        {/* Mode Toggle */}
        <div style={styles.toggleContainer}>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            style={styles.toggleBtn}
          >
            {isSignUp
              ? 'Já tem uma conta? Faça login'
              : 'Não tem conta? Cadastre-se agora'}
          </button>
        </div>

      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
    padding: '20px',
    boxSizing: 'border-box' as const,
  },
  loginCard: {
    width: '100%',
    maxWidth: '440px',
    padding: '40px 32px',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: '32px',
    textAlign: 'center' as const,
  },
  logoCircle: {
    width: '64px',
    height: '64px',
    borderRadius: '18px',
    background: 'var(--primary-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
  },
  title: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    marginTop: '4px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  inputWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute' as const,
    left: '12px',
    color: 'var(--text-muted)',
  },
  inputIndent: {
    paddingLeft: '38px',
  },
  toggleContainer: {
    marginTop: '24px',
    textAlign: 'center' as const,
  },
  toggleBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--primary)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    textDecoration: 'underline',
  },
  errorBox: {
    background: 'var(--danger-glass)',
    border: '1px solid rgba(220, 38, 38, 0.15)',
    color: 'var(--danger)',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center' as const,
  },
  successBox: {
    background: 'var(--success-glass)',
    border: '1px solid rgba(22, 163, 74, 0.15)',
    color: 'var(--success)',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center' as const,
  },
};
