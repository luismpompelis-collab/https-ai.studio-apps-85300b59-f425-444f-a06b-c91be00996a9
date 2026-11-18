export type UserRole = 'admin' | 'supervisor' | 'seller';

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  email: string;
  role: UserRole;
  supervisorId?: string | null;
  active: boolean;
  phone?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PresenceRecord {
  uid: string;
  fullName: string;
  role: UserRole;
  isOnline: boolean;
  lastSeenAt: unknown;
}

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'failed';

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  capturedAt: string; // ISO string
}

export type ClientStage = 'prospecto' | 'verificado' | 'aprobado' | 'en_revision' | 'rechazado';

export interface ClientNote {
  id: string;
  authorName: string;
  authorRole: string;
  text: string;
  date: string;
}

export interface ClientData {
  clientId: string;
  fullName: string;
  cedula: string;
  cedulaFront?: string | null; // URL or Base64
  cedulaBack?: string | null; // URL or Base64
  signature?: string | null; // Digital signature canvas Base64
  stage?: ClientStage;
  notes?: ClientNote[];
  phone: string;
  secondaryPhone?: string;
  sector: string;
  street: string;
  localNumber: string;
  additionalAddress?: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  capturedAt: string | null;
  sellerId: string;
  sellerName: string;
  supervisorId?: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  deletedAt?: string | null; // soft delete timestamp
  deletedBy?: string | null;
}

export interface AuditLog {
  logId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  clientId?: string;
  clientName?: string;
  action: 'CREAR' | 'MODIFICAR' | 'ELIMINAR' | 'RESTAURAR' | 'SINCRONIZAR' | 'LOGIN' | 'USUARIO_CREADO' | 'USUARIO_ESTADO';
  changes?: string;
  timestamp: string;
  device?: string;
}

export interface PendingSyncItem {
  id: string; // queue item id
  clientId: string;
  action: 'create' | 'update' | 'delete';
  clientData: ClientData;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export interface ClientFilter {
  searchQuery: string;
  sellerId: string;
  supervisorId: string;
  sector: string;
  startDate: string;
  endDate: string;
  syncStatus: string;
  hasPhoto: 'all' | 'withPhoto' | 'withoutPhoto';
  showDeleted: boolean;
}
