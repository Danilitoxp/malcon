import Sidebar from '../components/Sidebar';
import '../styles/globals.css';

export const metadata = {
  title: 'WhatsApp CRM SaaS - Operações Políticas & Atendimento',
  description: 'CRM avançado para gestão de contatos (eleitores/militantes) integrado ao WhatsApp Cloud API da Meta',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body suppressHydrationWarning>
        <div className="app-container">
          <Sidebar />
          <div style={{ flex: 1, height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
