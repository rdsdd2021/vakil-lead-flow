import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Lead, Ticket, FollowUp, Note, ActivityLog, CRMUser, UserRole, Document } from '@/types/crm';
import { format } from 'date-fns';

interface CRMContextType {
  currentUser: CRMUser;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  isLoadingLeads: boolean;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  logout: () => void;
  handleLoginSuccess: (tokenPayload: any) => void;
  updateLeadInServer: (id: string, updates: Partial<Lead>) => Promise<void>;
  tickets: Ticket[];
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  followUps: FollowUp[];
  allDueFollowUps: FollowUp[];
  setFollowUps: React.Dispatch<React.SetStateAction<FollowUp[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  activityLogs: ActivityLog[];
  setActivityLogs: React.Dispatch<React.SetStateAction<ActivityLog[]>>;
  users: CRMUser[];
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  addLeadToServer: (leadData: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  isLoadingTickets: boolean;
  addTicketToServer: (ticketData: Omit<Ticket, 'created_at' | 'updated_at'>) => Promise<void>;
  updateTicketInServer: (id: string, updates: Partial<Ticket>) => Promise<void>;
  addFollowUpToServer: (clientId: string, record: any) => Promise<void>;
  addActivityLog: (entityId: string, action: string, details: string, extra?: { recording_url?: string; call_duration?: string; call_status?: string; masked_number?: string }) => Promise<void>;
  fetchLeads: () => Promise<void>;
  fetchTickets: () => Promise<void>;
  fetchLawyers: () => Promise<void>;
  updateCurrentUserPhone: (phone: string) => void;
  addUserToServer: (userData: Omit<CRMUser, 'id'> & { id?: string }) => Promise<void>;
  updateUserInServer: (id: string, updates: Partial<CRMUser>) => Promise<void>;
  deleteUserFromServer: (id: string) => Promise<void>;
}

import { mockLeads, mockTickets, mockUsers } from '@/data/mockData';
import { AGENT_PHONE_DIRECTORY } from '@/lib/smartflo';

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return '';
    }
  }
  const envUrl = import.meta.env.VITE_API_URL || '';
  if (envUrl.includes('localhost') && typeof window !== 'undefined' && window.location.port === '8080') {
    return '';
  }
  return envUrl;
};

const API_BASE_URL = getApiBaseUrl();

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const CRMProvider = ({ children }: { children: ReactNode }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('front_desk');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

  // Current user state populated from AWS token
  const [currentUser, setCurrentUser] = useState<CRMUser>({ 
    id: `usr_loading_${Date.now()}`, 
    name: 'Loading User...', 
    role: 'front_desk', 
    email: '',
    phone: import.meta.env.VITE_SMARTFLO_DEFAULT_AGENT_PHONE || '9800000001'
  });
  
  // Dynamic users state
  const [users, setUsers] = useState<CRMUser[]>([]);

  const resolveUserPhone = (id: string, email?: string, cognitoPhone?: string): string => {
    if (cognitoPhone) {
      const clean = cognitoPhone.replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '').slice(-10);
      if (clean.length === 10) return clean;
    }
    const saved = localStorage.getItem(`smartflo_user_phone_${id}`);
    if (saved && saved.length === 10) return saved;
    const key = id.toLowerCase();
    if (AGENT_PHONE_DIRECTORY[key]) return AGENT_PHONE_DIRECTORY[key].phone;
    if (email) {
      const prefix = email.split('@')[0].toLowerCase();
      if (AGENT_PHONE_DIRECTORY[prefix]) return AGENT_PHONE_DIRECTORY[prefix].phone;
    }
    return localStorage.getItem('smartflo_agent_phone') || import.meta.env.VITE_SMARTFLO_DEFAULT_AGENT_PHONE || '9800000001';
  };

  const updateCurrentUserPhone = (phone: string) => {
    const clean = phone.replace(/^\+/, '').replace(/\s/g, '').replace(/\D/g, '').slice(-10);
    setCurrentUser(prev => ({ ...prev, phone: clean }));
    if (currentUser?.id) {
      localStorage.setItem(`smartflo_user_phone_${currentUser.id}`, clean);
    }
    localStorage.setItem('smartflo_agent_phone', clean);
  };

  // Check Local Auth Session on Load
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('vakil_auth_user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          setIsAuthenticated(true);
          setCurrentRole(user.role || 'front_desk');
          setCurrentUser(user);
          setIsAuthLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved auth user:', e);
    }
    setIsAuthenticated(false);
    setIsAuthLoading(false);
  }, []);

  const handleLoginSuccess = (payload: any) => {
    setIsAuthenticated(true);
    const groups = payload['cognito:groups'] || [];
    const customRole = (payload['custom:role'] || payload.role || '').toLowerCase();
    const normalizedGroups = groups.map((g: string) => g.toLowerCase());
    
    let resolvedRole: UserRole = 'front_desk';
    if (normalizedGroups.includes('super_admin') || normalizedGroups.includes('superadmin') || customRole === 'super_admin') {
      resolvedRole = 'super_admin';
    } else if (normalizedGroups.includes('lawyer') || normalizedGroups.includes('lawyers') || customRole === 'lawyer') {
      resolvedRole = 'lawyer';
    } else if (normalizedGroups.includes('front_desk') || normalizedGroups.includes('frontdesk') || customRole === 'front_desk') {
      resolvedRole = 'front_desk';
    }
    
    const userId = payload.id || payload['cognito:username'] || payload.username || payload.sub || `usr_${Date.now()}`;
    const userEmail = payload.email || payload['cognito:username'] || '';
    const userPhone = payload.phone || resolveUserPhone(userId, userEmail, payload.phone_number || payload['custom:phone']);

    const userObj: CRMUser = {
      id: userId,
      name: payload.name || [payload.given_name, payload.family_name === '-' ? null : payload.family_name].filter(Boolean).join(' ') || 'Authorized User',
      role: resolvedRole,
      email: userEmail,
      phone: userPhone,
    };

    setCurrentRole(resolvedRole);
    setCurrentUser(userObj);
    localStorage.setItem('vakil_auth_user', JSON.stringify(userObj));
  };

  const logout = () => {
    localStorage.removeItem('vakil_auth_user');
    setIsAuthenticated(false);
  };

  const fetchLeads = async () => {
    // 1. Attempt MySQL REST API
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE_URL}/api/leads`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timer);

      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Merge with local leads to ensure zero loss
          const merged = [...data];
          try {
            const stored = localStorage.getItem('vakil_leads');
            if (stored) {
              const localParsed = JSON.parse(stored);
              if (Array.isArray(localParsed)) {
                for (const l of localParsed) {
                  if (!merged.some(m => m.id === l.id)) {
                    merged.push(l);
                  }
                }
              }
            }
          } catch (e) {}

          setLeads(merged);
          localStorage.setItem('vakil_leads', JSON.stringify(merged));
          setIsLoadingLeads(false);
          return;
        }
      }
    } catch (e) {
      // Offline fallback
    }

    // 2. Offline / LocalStorage Fallback
    try {
      const stored = localStorage.getItem('vakil_leads');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setLeads(parsed);
          setIsLoadingLeads(false);
          return;
        }
      }
      setLeads([]);
    } catch (error) {
      console.warn('LocalStorage leads unavailable:', error);
      setLeads([]);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const fetchTickets = async () => {
    // 1. Attempt MySQL REST API
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE_URL}/api/tickets`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timer);

      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTickets(data);
          localStorage.setItem('vakil_tickets', JSON.stringify(data));
          setIsLoadingTickets(false);
          return;
        }
      }
    } catch (e) {
      // Offline fallback
    }

    // 2. Offline / LocalStorage Fallback
    try {
      const stored = localStorage.getItem('vakil_tickets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setTickets(parsed);
          setIsLoadingTickets(false);
          return;
        }
      }
      setTickets([]);
    } catch (error) {
      console.warn('LocalStorage tickets unavailable:', error);
      setTickets([]);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const fetchLawyers = async () => {
    // 1. Attempt MySQL REST API
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE_URL}/api/users`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timer);

      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setUsers(data);
          localStorage.setItem('vakil_users', JSON.stringify(data));
          return;
        }
      }
    } catch (e) {
      // Offline fallback
    }

    // 2. Offline / LocalStorage Fallback
    try {
      const stored = localStorage.getItem('vakil_users');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUsers(parsed);
          return;
        }
      }
      setUsers(mockUsers);
      localStorage.setItem('vakil_users', JSON.stringify(mockUsers));
    } catch (error) {
      console.warn('LocalStorage users unavailable:', error);
      setUsers(mockUsers);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchTickets();
    fetchLawyers();

    const handleStorageSync = () => {
      fetchLeads();
      fetchTickets();
      fetchLawyers();
    };

    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('vakil_storage_sync', handleStorageSync);
    return () => {
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('vakil_storage_sync', handleStorageSync);
    };
  }, []);

  const addLeadToServer = async (leadData: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) => {
    const completeLead: Lead = {
      id: `l_${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...leadData,
      status: !leadData.status || String(leadData.status).toLowerCase() === 'new' ? 'NEW_LEAD' : leadData.status
    };
    
    // Optimistic Local Update
    setLeads(prev => {
      const updated = [completeLead, ...prev];
      localStorage.setItem('vakil_leads', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    // Asynchronous MySQL Persistence
    try {
      fetch(`${API_BASE_URL}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completeLead),
      }).catch(err => console.warn('[CRM] MySQL background sync deferred (offline):', err.message));
    } catch (e) {}
  };

  const updateLeadInServer = async (id: string, updates: Partial<Lead>) => {
    // Optimistic Local Update
    setLeads(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, ...updates, updated_at: new Date().toISOString() } : l);
      localStorage.setItem('vakil_leads', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    // Asynchronous MySQL Persistence
    try {
      fetch(`${API_BASE_URL}/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(err => console.warn('[CRM] MySQL background update deferred:', err.message));
    } catch (e) {}
  };

  const addTicketToServer = async (ticketData: Omit<Ticket, 'created_at' | 'updated_at'>) => {
    const completeTicket: Ticket = {
      ticket_id: ticketData.ticket_id || `t_${Date.now()}`,
      client_id: ticketData.client_id,
      client_name: ticketData.client_name,
      lawyer_id: ticketData.lawyer_id,
      lawyer_name: ticketData.lawyer_name,
      service_type: ticketData.service_type,
      description: ticketData.description,
      status: ticketData.status,
      priority: ticketData.priority,
      amount: ticketData.amount || 0,
      advance_paid: ticketData.advance_paid || 0,
      communication_notes: ticketData.communication_notes,
      followup_history: ticketData.followup_history,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic Local Update
    setTickets(prev => {
      const updated = [completeTicket, ...prev];
      localStorage.setItem('vakil_tickets', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    // Asynchronous MySQL Persistence
    try {
      fetch(`${API_BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completeTicket),
      }).catch(err => console.warn('[CRM] MySQL background ticket sync deferred:', err.message));
    } catch (e) {}
  };

  const updateTicketInServer = async (id: string, updates: Partial<Ticket>) => {
    // Optimistic Local Update
    setTickets(prev => {
      const updated = prev.map(t => t.ticket_id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t);
      localStorage.setItem('vakil_tickets', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    // Asynchronous MySQL Persistence
    try {
      fetch(`${API_BASE_URL}/api/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(err => console.warn('[CRM] MySQL background ticket update deferred:', err.message));
    } catch (e) {}
  };

  const addUserToServer = async (userData: Omit<CRMUser, 'id'> & { id?: string }) => {
    const newUser: CRMUser = {
      id: userData.id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: userData.name,
      email: userData.email,
      phone: userData.phone ? userData.phone.replace(/\D/g, '').slice(-10) : '9800000001',
      role: userData.role,
      specialization: userData.specialization || (userData.role === 'lawyer' ? 'General Legal Practice' : ''),
      status: userData.status || 'active',
      created_at: new Date().toISOString(),
    };

    setUsers(prev => {
      const updated = [...prev, newUser];
      localStorage.setItem('vakil_users', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    try {
      fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      }).catch(err => console.warn('[CRM] Users backend sync deferred:', err.message));
    } catch (e) {}
  };

  const updateUserInServer = async (id: string, updates: Partial<CRMUser>) => {
    setUsers(prev => {
      const updated = prev.map(u => u.id === id ? { ...u, ...updates } : u);
      localStorage.setItem('vakil_users', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    try {
      fetch(`${API_BASE_URL}/api/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      }).catch(err => console.warn('[CRM] User update deferred:', err.message));
    } catch (e) {}
  };

  const deleteUserFromServer = async (id: string) => {
    setUsers(prev => {
      const updated = prev.filter(u => u.id !== id);
      localStorage.setItem('vakil_users', JSON.stringify(updated));
      return updated;
    });
    window.dispatchEvent(new Event('vakil_storage_sync'));

    try {
      fetch(`${API_BASE_URL}/api/users?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(err => console.warn('[CRM] User delete deferred:', err.message));
    } catch (e) {}
  };
  
  // Follow-ups: only surface explicitly scheduled items from followup_history.
  // Nothing is auto-derived or auto-generated — a follow-up only appears here
  // if a user manually created it (completed: false entry in followup_history).
  const allDueFollowUps = useMemo(() => {
    const combined = [
      ...leads.map(l => ({ ...l, isLead: true })),
      ...tickets.map(t => ({ ...t, id: t.ticket_id, isLead: false }))
    ];

    const terminalStatuses = ['COMPLETED', 'NOT_INTERESTED', 'USER_DROPPED', 'ARCHIVED', 'WORK_COMPLETED', 'REJECTED'];

    return combined
      .filter(item => !terminalStatuses.includes(item.status))
      .flatMap(item => {
        let history: any[] = [];
        try {
          if (item.followup_history) {
            history = typeof item.followup_history === 'string'
              ? JSON.parse(item.followup_history)
              : item.followup_history;
          }
        } catch (e) {
          history = [];
        }

        // Only return explicitly scheduled (incomplete) follow-ups
        return history
          .filter((h: any) => h.completed === false || h.completed === 'false')
          .map((task: any) => ({
            id: `history-${item.id}-${task.attempt}`,
            lead_id: item.id,
            lead_name: item.isLead ? (item as any).name : (item as any).client_name,
            lead_service: item.isLead ? (item as any).service : (item as any).service_type,
            entity_type: item.isLead ? 'lead' : 'ticket',
            attempt: task.attempt,
            type: task.type || 'call',
            scheduled_at: task.scheduled_at,
            completed: false,
            note: task.note,
          }));
      }) as FollowUp[];
  }, [leads, tickets]);

  const addFollowUpToServer = async (targetId: string, record: any) => {
    
    // 1. Find the client (search leads and tickets)
    const lead = leads.find(l => l.id === targetId);
    const ticket = tickets.find(t => t.ticket_id === targetId);
    const client = lead || ticket;
    
    if (!client) {
      console.error('CRMContext: Client not found for ID', targetId);
      throw new Error('Client not found');
    }
    
    // 2. Parse existing history
    let history: any[] = [];
    try {
      if (client.followup_history) {
        history = typeof client.followup_history === 'string' 
          ? JSON.parse(client.followup_history) 
          : client.followup_history;
      }
    } catch (e) {
      console.error('Error parsing follow-up history:', e);
      // If parsing fails, treat history as empty for merging purposes
      history = []; 
    }
    
    // 3. Merge logic: If record with same attempt exists, update it. Otherwise append.
    let updatedHistory;
    const existingIndex = history.findIndex((h: any) => h.attempt === record.attempt);
    
    if (existingIndex >= 0) {
      updatedHistory = [...history];
      updatedHistory[existingIndex] = { ...updatedHistory[existingIndex], ...record };
    } else {
      updatedHistory = [...history, record];
    }
    
    // 4. Save and sync back to Lead/Ticket locally in localStorage
    const stringifiedHistory = JSON.stringify(updatedHistory);
    if (lead) {
      await updateLeadInServer(targetId, { 
        followup_history: stringifiedHistory,
        followup_count: record.attempt,
        updated_at: new Date().toISOString()
      });
      const logDetails = record.completed ? `Follow-up #${record.attempt} completed` : `Follow-up #${record.attempt} scheduled for ${format(new Date(record.scheduled_at), 'MMM d, h:mm a')}`;
      await addActivityLog(targetId, record.completed ? 'Follow-up Done' : 'Follow-up Scheduled', logDetails);
    } else if (ticket) {
      await updateTicketInServer(targetId, { 
        followup_history: stringifiedHistory,
        updated_at: new Date().toISOString()
      });
      const logDetails = record.completed ? `Follow-up #${record.attempt} completed` : `Follow-up #${record.attempt} scheduled for ${format(new Date(record.scheduled_at), 'MMM d, h:mm a')}`;
      await addActivityLog(targetId, record.completed ? 'Follow-up Done' : 'Follow-up Scheduled', logDetails);
    }

    // Update local follow-ups state for legacy usage if needed
    setFollowUps(prev => [{...record, lead_id: targetId}, ...prev]);
  };

  const activityLogs = useMemo(() => {
    const allLogs: ActivityLog[] = [];
    
    [...leads, ...tickets].forEach(item => {
      const id = (item as any).id || (item as any).ticket_id;
      if (item.communication_notes) {
        try {
          const parsed = typeof item.communication_notes === 'string' 
            ? JSON.parse(item.communication_notes) 
            : item.communication_notes;
          
          if (parsed.activity_logs && Array.isArray(parsed.activity_logs)) {
            parsed.activity_logs.forEach((log: any) => {
              allLogs.push({
                ...log,
                entity_id: id
              });
            });
          }

          if (parsed.call_logs && Array.isArray(parsed.call_logs)) {
            parsed.call_logs.forEach((clog: any) => {
              if (!allLogs.some(l => l.id === clog.id)) {
                allLogs.push({
                  id: clog.id || `clog_${Date.now()}`,
                  action: clog.action || 'Call Log',
                  details: clog.text || clog.details || 'Call recorded',
                  call_duration: clog.duration || clog.call_duration,
                  call_status: clog.call_status,
                  recording_url: clog.recording_url,
                  masked_number: clog.masked_number,
                  created_by: clog.created_by || 'Agent',
                  created_at: clog.created_at || new Date().toISOString(),
                  entity_id: id
                });
              }
            });
          }
        } catch (e) {
          // Ignore parse errors for older data
        }
      }
    });

    return allLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [leads, tickets]);

  const addActivityLog = async (
    entityId: string, 
    action: string, 
    details: string, 
    extra?: { 
      recording_url?: string; 
      call_duration?: string; 
      call_status?: string; 
      masked_number?: string 
    }
  ) => {
    const lead = leads.find(l => l.id === entityId);
    const ticket = tickets.find(t => t.ticket_id === entityId);
    const item = lead || ticket;

    if (!item) return;

    let parsedNotes: any = { notes: [], call_logs: [], meetings: [], activity_logs: [] };
    try {
      if (item.communication_notes) {
        parsedNotes = typeof item.communication_notes === 'string'
          ? JSON.parse(item.communication_notes)
          : item.communication_notes;
      }
    } catch (e) {
      console.error('Error parsing communication notes for log:', e);
    }

    const newLog = {
      id: `a${Date.now()}`,
      action,
      details,
      recording_url: extra?.recording_url,
      call_duration: extra?.call_duration,
      call_status: extra?.call_status,
      masked_number: extra?.masked_number,
      created_by: currentUser.name,
      created_at: new Date().toISOString()
    };

    const isCallAction = action.toLowerCase().includes('call') || action.toLowerCase().includes('answer') || action.toLowerCase().includes('busy') || action.toLowerCase().includes('rejected');
    
    const callLogItem = isCallAction ? {
      id: `call_${Date.now()}`,
      text: `${action}: ${details}`,
      action,
      duration: extra?.call_duration || '00:00',
      call_status: extra?.call_status || action,
      recording_url: extra?.recording_url,
      masked_number: extra?.masked_number,
      created_by: currentUser.name,
      created_at: new Date().toISOString()
    } : null;

    const updatedNotes = {
      ...parsedNotes,
      activity_logs: [newLog, ...(parsedNotes.activity_logs || [])],
      call_logs: callLogItem ? [callLogItem, ...(parsedNotes.call_logs || [])] : (parsedNotes.call_logs || [])
    };

    if (lead) {
      await updateLeadInServer(entityId, { 
        communication_notes: JSON.stringify(updatedNotes),
        last_called_by: currentUser.id,
        last_called_at: new Date().toISOString()
      });
    } else if (ticket) {
      await updateTicketInServer(entityId, { communication_notes: JSON.stringify(updatedNotes) });
    }

    // Mirror to MySQL activity_logs table
    try {
      fetch(`${API_BASE_URL}/api/activity-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newLog.id,
          entity_type: lead ? 'lead' : 'ticket',
          entity_id: entityId,
          action: newLog.action,
          details: newLog.details,
          call_duration: newLog.call_duration,
          call_status: newLog.call_status,
          recording_url: newLog.recording_url,
          masked_number: newLog.masked_number,
          created_by: newLog.created_by,
        }),
      }).catch(() => {});
    } catch (e) {}
  };

  return (
    <CRMContext.Provider value={{
      currentUser,
      currentRole,
      setCurrentRole,
      isAuthenticated,
      isAuthLoading,
      logout,
      handleLoginSuccess,
      leads,
      setLeads,
      isLoadingLeads,
      tickets,
      setTickets,
      followUps,
      allDueFollowUps,
      setFollowUps,
      notes,
      setNotes,
      activityLogs,
      setActivityLogs: () => {}, // No-op, managed via addActivityLog
      users,
      documents,
      setDocuments,
      addLeadToServer,
      updateLeadInServer,
      isLoadingTickets,
      addTicketToServer,
      updateTicketInServer,
      addFollowUpToServer,
      addActivityLog,
      fetchLeads,
      fetchTickets,
      fetchLawyers,
      updateCurrentUserPhone,
      addUserToServer,
      updateUserInServer,
      deleteUserFromServer,
    }}>
      {children}
    </CRMContext.Provider>
  );
};

export const useCRM = () => {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error('useCRM must be used within CRMProvider');
  return ctx;
};
