import React, { useState, useEffect } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PresenceProvider } from './context/PresenceContext';
import { SyncProvider } from './context/SyncContext';
import { Navbar } from './components/Navbar';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { AdminDashboard } from './components/AdminDashboard';
import { SellerManagement } from './components/SellerManagement';
import { AuditLogView } from './components/AuditLogView';
import { ClientDossierModal } from './components/ClientDossierModal';
import { OfflineSyncModal } from './components/OfflineSyncModal';
import { ClientMapView } from './components/ClientMapView';
import { AuthModal } from './components/AuthModal';
import { testFirebaseConnection } from './lib/firebase';
import { GOOGLE_MAPS_API_KEY } from './lib/googleMaps';
import { ClientData } from './types';

type ViewMode = 'register' | 'clients' | 'map' | 'dashboard' | 'sellers' | 'audit';

function MainApp() {
  const { currentUser, userProfile, loading, activeRole } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>('register');
  const [selectedClient, setSelectedClient] = useState<ClientData | null>(null);
  const [editingClient, setEditingClient] = useState<ClientData | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Connection test on boot
  useEffect(() => {
    testFirebaseConnection();
  }, []);

  // Set default view based on role
  useEffect(() => {
    if (activeRole === 'seller' && (currentView === 'dashboard' || currentView === 'sellers' || currentView === 'audit')) {
      setCurrentView('register');
    }
  }, [activeRole, currentView]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-black text-2xl animate-pulse">
          CP
        </div>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Iniciando CLIENTES PRO...</p>
      </div>
    );
  }

  if (!currentUser && !userProfile) {
    return <AuthModal />;
  }

  const handleEditClient = (client: ClientData) => {
    setEditingClient(client);
    setCurrentView('register');
  };

  const handleFormSuccess = () => {
    setEditingClient(null);
    setCurrentView('clients');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar & Mobile Bottom Bar */}
      <Navbar
        currentView={currentView}
        onNavigate={(v) => {
          if (v !== 'register') {
            setEditingClient(null);
          }
          setCurrentView(v);
        }}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'register' && (
          <ClientForm
            initialClient={editingClient}
            onSuccess={handleFormSuccess}
            onCancel={editingClient ? () => { setEditingClient(null); setCurrentView('clients'); } : undefined}
          />
        )}

        {currentView === 'clients' && (
          <ClientList
            onSelectClient={(c) => setSelectedClient(c)}
            onEditClient={handleEditClient}
          />
        )}

        {currentView === 'map' && (
          <ClientMapView
            onSelectClient={(c) => setSelectedClient(c)}
          />
        )}

        {currentView === 'dashboard' && (
          <AdminDashboard
            onNavigateToClients={() => setCurrentView('clients')}
          />
        )}

        {currentView === 'sellers' && activeRole === 'admin' && (
          <SellerManagement />
        )}

        {currentView === 'audit' && activeRole === 'admin' && (
          <AuditLogView />
        )}
      </main>

      {/* Client Dossier Modal */}
      {selectedClient && (
        <ClientDossierModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onEdit={handleEditClient}
        />
      )}

      {/* Offline Sync Queue Modal */}
      {isSyncModalOpen && (
        <OfflineSyncModal onClose={() => setIsSyncModalOpen(false)} />
      )}
    </div>
  );
}

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
    };
  }, []);

  const content = (
    <>
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <AuthProvider>
        <PresenceProvider>
          <SyncProvider>
            <MainApp />
          </SyncProvider>
        </PresenceProvider>
      </AuthProvider>
    </>
  );

  if (GOOGLE_MAPS_API_KEY) {
    return (
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        libraries={['marker']}
        language="es"
        region="DO"
      >
        {content}
      </APIProvider>
    );
  }

  return content;
}
