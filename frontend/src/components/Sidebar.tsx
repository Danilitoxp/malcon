'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Users, 
  Settings, 
  LogOut, 
  User, 
  MessageCircle 
} from 'lucide-react';

interface Profile {
  name: string;
  role: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load current user profile
  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
      }
      setLoading(false);
    }

    loadProfile();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          const { data } = await supabase
            .from('profiles')
            .select('name, role')
            .eq('id', session.user.id)
            .single();
          if (data) setProfile(data as Profile);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (pathname === '/login') return null;

  const coreItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'WhatsApp', path: '/inbox', icon: MessageSquare },
    { name: 'Eleitores', path: '/contacts', icon: Users },
  ];

  const systemItems = [
    { name: 'Configurações', path: '/settings', icon: Settings },
  ];

  const displayName = profile?.name || 'Carregando...';
  const displayRole = profile?.role === 'admin' ? 'administrator' : 'agent';

  return (
    <aside style={sidebarStyles.aside}>
      {/* User Profile Header */}
      {!loading && (
        <div style={sidebarStyles.profileHeader}>
          <div style={sidebarStyles.avatarCircle}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div style={sidebarStyles.profileMeta}>
            <h4 style={sidebarStyles.profileName}>{displayName}</h4>
            <span style={sidebarStyles.profileRole}>{displayRole}</span>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav style={sidebarStyles.nav}>
        {coreItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          return (
            <Link key={item.path} href={item.path} style={{ textDecoration: 'none' }}>
              <div style={{
                ...sidebarStyles.navItem,
                ...(isActive ? sidebarStyles.navItemActive : {})
              }}>
                <Icon size={20} color={isActive ? '#0091ff' : '#94a3b8'} />
                <span style={isActive ? { color: '#0091ff', fontWeight: 600 } : {}}>{item.name}</span>
              </div>
            </Link>
          );
        })}

        <div style={sidebarStyles.sectionHeader}>Canais & Configurações</div>

        {systemItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          return (
            <Link key={item.path} href={item.path} style={{ textDecoration: 'none' }}>
              <div style={{
                ...sidebarStyles.navItem,
                ...(isActive ? sidebarStyles.navItemActive : {})
              }}>
                <Icon size={20} color={isActive ? '#0091ff' : '#94a3b8'} />
                <span style={isActive ? { color: '#0091ff', fontWeight: 600 } : {}}>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Session Footer */}
      <div style={sidebarStyles.footer}>
        <button onClick={handleLogout} style={sidebarStyles.logoutBtn}>
          <LogOut size={20} color="#94a3b8" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

const sidebarStyles = {
  aside: {
    width: '250px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '32px 0 24px 0',
    boxSizing: 'border-box' as const,
    background: '#ffffff',
    borderRight: '1px solid var(--border-muted)',
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 24px 24px 24px',
    marginBottom: '8px',
  },
  avatarCircle: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    background: 'var(--primary-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '1.05rem',
  },
  profileMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  profileName: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  profileRole: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  sectionHeader: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    padding: '24px 24px 8px 24px',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 24px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontSize: '0.92rem',
    fontWeight: 500,
    borderLeft: '4px solid transparent',
  },
  navItemActive: {
    color: '#0091ff',
    fontWeight: 600,
    borderLeft: '4px solid #0091ff',
    background: 'rgba(0, 145, 255, 0.03)',
  },
  footer: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    borderTop: '1px solid var(--border-muted)',
    paddingTop: '16px',
  },
  logoutBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 24px',
    width: '100%',
    fontFamily: 'inherit',
    fontSize: '0.92rem',
    fontWeight: 500,
    transition: 'all 0.15s ease',
    textAlign: 'left' as const,
  },
};
