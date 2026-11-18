import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { AuditLog, UserProfile } from '../types';

export async function recordAuditLog(
  user: UserProfile,
  action: AuditLog['action'],
  details: {
    clientId?: string;
    clientName?: string;
    changes?: string;
  }
): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const auditEntry: AuditLog = {
    logId,
    userId: user.uid,
    userName: user.fullName || user.username || user.email,
    userEmail: user.email,
    userRole: user.role,
    clientId: details.clientId,
    clientName: details.clientName,
    action,
    changes: details.changes || '',
    timestamp: new Date().toISOString(),
    device: typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 80)}` : 'Web'
  };

  // Try storing to Firestore
  try {
    await setDoc(doc(db, 'audit_logs', logId), auditEntry);
  } catch (err) {
    // If offline or rule permission error, save to localStorage audit buffer
    try {
      const existing = JSON.parse(localStorage.getItem('clientes_pro_audit_buffer') || '[]');
      existing.unshift(auditEntry);
      localStorage.setItem('clientes_pro_audit_buffer', JSON.stringify(existing.slice(0, 100)));
    } catch {
      // ignore local storage error
    }
    console.warn('Audit log queued locally due to network/auth:', err);
  }
}

export async function fetchRecentAuditLogs(maxLogs = 50): Promise<AuditLog[]> {
  try {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(maxLogs));
    const snap = await getDocs(q);
    const logs: AuditLog[] = [];
    snap.forEach((d) => logs.push(d.data() as AuditLog));

    // Also merge any local buffer logs
    try {
      const buffer: AuditLog[] = JSON.parse(localStorage.getItem('clientes_pro_audit_buffer') || '[]');
      for (const b of buffer) {
        if (!logs.some((l) => l.logId === b.logId)) {
          logs.unshift(b);
        }
      }
    } catch {
      // ignore
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return logs.slice(0, maxLogs);
  } catch (err) {
    // Fallback to local logs
    try {
      const buffer: AuditLog[] = JSON.parse(localStorage.getItem('clientes_pro_audit_buffer') || '[]');
      return buffer;
    } catch {
      return [];
    }
  }
}
