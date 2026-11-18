import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { auth, db, stripUndefined } from './firebase';
import { AuditLog, UserProfile } from '../types';

const AUDIT_BUFFER_KEY = 'clientes_pro_audit_buffer';

function saveAuditToLocalBuffer(auditEntry: AuditLog): void {
  try {
    const existing = JSON.parse(localStorage.getItem(AUDIT_BUFFER_KEY) || '[]');
    existing.unshift(auditEntry);
    localStorage.setItem(AUDIT_BUFFER_KEY, JSON.stringify(existing.slice(0, 100)));
  } catch {
    // ignore local storage error
  }
}

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
  const auditEntry: AuditLog = stripUndefined({
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
  });

  if (!auth.currentUser) {
    saveAuditToLocalBuffer(auditEntry);
    return;
  }

  // Try storing to Firestore
  try {
    await setDoc(doc(db, 'audit_logs', logId), auditEntry);
  } catch (err) {
    saveAuditToLocalBuffer(auditEntry);
    console.warn('Audit log queued locally due to network/auth:', err);
  }
}

export async function fetchRecentAuditLogs(maxLogs = 50): Promise<AuditLog[]> {
  let buffer: AuditLog[] = [];
  try {
    buffer = JSON.parse(localStorage.getItem(AUDIT_BUFFER_KEY) || '[]');
  } catch {
    buffer = [];
  }

  if (!auth.currentUser) {
    return buffer.slice(0, maxLogs);
  }

  try {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(maxLogs));
    const snap = await getDocs(q);
    const logs: AuditLog[] = [];
    snap.forEach((d) => logs.push(d.data() as AuditLog));

    for (const b of buffer) {
      if (!logs.some((l) => l.logId === b.logId)) {
        logs.unshift(b);
      }
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return logs.slice(0, maxLogs);
  } catch {
    return buffer.slice(0, maxLogs);
  }
}
