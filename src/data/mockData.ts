import { Lead, Ticket, Note, FollowUp, ActivityLog, CRMUser, Document } from '@/types/crm';

export const mockUsers: CRMUser[] = [
  { id: 'admin', name: 'Priya Sharma (Super Admin)', role: 'super_admin', email: 'admin@vakiltech.com', phone: '9800000001' },
  { id: 'frontdesk', name: 'Rahul Verma (Front Desk)', role: 'front_desk', email: 'frontdesk@vakiltech.com', phone: '9800000002' },
  { id: 'devika', name: 'Adv. Devika', role: 'lawyer', email: 'devika@vakiltech.com', phone: '9800000003' },
  { id: 'aaditya', name: 'Adv. Aaditya', role: 'lawyer', email: 'aaditya@vakiltech.com', phone: '9800000004' },
  { id: 'pritam', name: 'Adv. Pritam Banik', role: 'lawyer', email: 'pritam@vakiltech.com', phone: '9800000005' },
  { id: 'lawyer', name: 'Adv. Meera Patel', role: 'lawyer', email: 'lawyer@vakiltech.com', phone: '9800000006' },
];

// Production Clean: Zero dummy leads or tickets (dynamically loaded from Kapso & serverless API)
export const mockLeads: Lead[] = [];
export const mockTickets: Ticket[] = [];
export const mockNotes: Note[] = [];
export const mockFollowUps: FollowUp[] = [];
export const mockActivityLogs: ActivityLog[] = [];
export const mockDocuments: Document[] = [];
