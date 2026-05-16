'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LogOut, RefreshCw, DollarSign, ShoppingBag, Users,
  CheckCircle, ChefHat, LayoutGrid, Menu, X, TrendingUp,
  Coffee, Circle, ArrowRight, Plus, Edit2, Trash2, Save, Upload, Image as ImageIcon, Download, Mail, CreditCard, XCircle, FileText,
  Zap, AlertTriangle
} from 'lucide-react';
import gsap from 'gsap';
import { Draggable } from 'gsap/all';
import { useAdminStore } from '@/store/adminStore';
import { orderAPI, adminAPI, menuAPI, uploadAPI } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { polling } from '@/lib/polling';
import * as actions from './actions';
import PaymentAdmin from './components/PaymentAdmin';
import { useDialog } from '@/components/ui/ConfirmDialog';
import {
  playNewOrder,
  playPaymentReceived,
  playSuccess,
  playError,
  requestNotificationPermission,
  showNotification,
} from '@/lib/sounds';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(Draggable);
}

// ─── Nav items ────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutGrid, roles: ['super_admin', 'manager', 'admin'] },
  { id: 'kitchen', label: 'Kitchen', short: 'Kitchen', icon: ChefHat, roles: ['super_admin', 'manager', 'kitchen', 'admin'] },
  { id: 'sessions', label: 'Tables', short: 'Tables', icon: Users, roles: ['super_admin', 'manager', 'admin'] },
  { id: 'billing', label: 'Billing', short: 'Billing', icon: DollarSign, roles: ['super_admin', 'manager', 'admin'] },
  { id: 'menu', label: 'Menu', short: 'Menu', icon: Coffee, roles: ['super_admin', 'manager', 'admin'] },
  { id: 'payments', label: 'Payments', short: 'Payments', icon: CreditCard, roles: ['super_admin', 'manager', 'admin'] },
  { id: 'admins', label: 'Admins', short: 'Admins', icon: Users, roles: ['super_admin', 'admin'] },
  { id: 'audit', label: 'Audit / Recon', short: 'Audit', icon: FileText, roles: ['super_admin', 'manager', 'admin'] },
] as const;

type TabId = (typeof NAV_ITEMS)[number]['id'];

// ─── Status colour map ─────────────────────────────────────────
const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  pending: { label: 'Pending', dot: '#fdca00', badge: 'rgba(253,202,0,0.12)' },
  preparing: { label: 'Preparing', dot: '#05503c', badge: 'rgba(5,80,60,0.10)' },
  ready: { label: 'Ready', dot: '#22c55e', badge: 'rgba(34,197,94,0.12)' },
};

const ROLE_STYLES: Record<string, { bg: string; border: string; text: string; label: string; glow: string }> = {
  admin: {
    bg: 'rgba(253,202,0,0.12)',
    border: 'rgba(253,202,0,0.3)',
    text: '#fdca00',
    label: 'Super Admin',
    glow: '0 4px 12px rgba(253,202,0,0.15)'
  },
  super_admin: {
    bg: 'rgba(253,202,0,0.15)',
    border: 'rgba(253,202,0,0.4)',
    text: '#fdca00',
    label: 'Super Admin',
    glow: '0 4px 15px rgba(253,202,0,0.25)'
  },
  manager: {
    bg: 'rgba(5,80,60,0.08)',
    border: 'rgba(5,80,60,0.15)',
    text: '#05503c',
    label: 'Manager',
    glow: '0 4px 12px rgba(5,80,60,0.08)'
  },
  kitchen: {
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.15)',
    text: '#8b5cf6',
    label: 'Kitchen',
    glow: '0 4px 12px rgba(139,92,246,0.1)'
  }
};

export default function AdminDashboard() {
  const router = useRouter();
  const ticketRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevOrderIds = useRef<Set<number>>(new Set());
  const { isAuthenticated, user, orders, setOrders, updateOrderStatus, logout, setAuth } = useAdminStore();
  const dialog = useDialog();
  const [adminToast, setAdminToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Dashboard state
  const [dashboard, setDashboard] = useState<any>(null);

  // Menu CMS state
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [menuForm, setMenuForm] = useState({
    name: '',
    category: 'coffee',
    description: '',
    ingredients: '',
    price: '',
    image_url: '',
    is_available: true,
    is_signature: false,
    stock_quantity: '999',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('all');

  // Fetch unique categories from DB dynamically
  const MENU_CATEGORIES = useMemo(() => {
    const hardcoded = [
      { id: 'appetizers', label: 'Appetizers' },
      { id: 'mains', label: 'Mains' },
      { id: 'sides', label: 'Sides' },
      { id: 'desserts', label: 'Desserts' },
      { id: 'beverages', label: 'Beverages' },
    ];

    const dbCats = menuItems ? Array.from(new Set(menuItems.map(item => item.category))) : [];
    const otherCats = dbCats
      .filter(cat => !hardcoded.find(h => h.id === cat))
      .filter(Boolean);

    return [
      ...hardcoded,
      ...otherCats.map(cat => ({ id: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) }))
    ];
  }, [menuItems]);

  // Admin management state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminForm, setAdminForm] = useState({
    username: '',
    password: '',
    role: 'kitchen',
    full_name: '',
  });

  // Tables tab state
  const [tables, setTables] = useState<any[]>([]);
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [sessionOrders, setSessionOrders] = useState<Record<number, any[]>>({});
  const [paymentMethod, setPaymentMethod] = useState<Record<number, string>>({});
  const [addingTable, setAddingTable] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [tableActionLoading, setTableActionLoading] = useState<number | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [resettingData, setResettingData] = useState(false);
  const [bulkCloseLoading, setBulkCloseLoading] = useState(false);

  // Audit & Reconciliation filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditExpandedRow, setAuditExpandedRow] = useState<number | null>(null);

  // Quick price edit: maps item.id -> { draft: string, saving: bool }
  const [quickPriceEdit, setQuickPriceEdit] = useState<Record<number, { draft: string; saving: boolean }>>({});

  const [isClient, setIsClient] = useState(false);
  const [currentDate, setCurrentDate] = useState('');

  // ── Auth & bootstrap ─────────────────────────────────────────
  useEffect(() => {
    setIsClient(true);
    setCurrentDate(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));

    const token = localStorage.getItem('admin_token');
    const storedUser = localStorage.getItem('admin_user');

    if (!token) { router.push('/admin/login'); return; }

    if (!isAuthenticated && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (userData) {
          setAuth(userData, token);

          // Set default tab based on role
          if (userData.role === 'kitchen') {
            setActiveTab('kitchen');
          } else {
            setActiveTab('dashboard');
          }
        }
      } catch (err) {
        console.error('Failed to parse stored user:', err);
        localStorage.removeItem('admin_user');
        localStorage.removeItem('admin_token');
        router.push('/admin/login');
        return;
      }
    }

    // VERIFY SUPABASE SESSION
    supabase.auth.getSession().then((resp: any) => {
      const session = resp.data?.session;
      if (!session) {
        console.warn('Supabase session expired or missing. Forcing re-login.');
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        setAuth(null as any, '');
        router.push('/admin/login');
      }
    });

    loadData();

    // ── Real-time Subscriptions ────────────────────────────────
    const ordersSub = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        loadOrders();
        loadDashboard();
        loadSessions(); // Orders affect session totals
        loadTables();   // Ensure table cards show new orders/totals

        // Play sound only for new INSERT events
        if (payload.eventType === 'INSERT') {
          const newId: number = payload.new?.id;
          if (newId && !prevOrderIds.current.has(newId)) {
            prevOrderIds.current.add(newId);
            playNewOrder();
            showNotification('New Order!', `Order #${String(newId).slice(-4)} received from Table ${payload.new?.session_id ?? '?'}.`);
          }
        }
      })
      .subscribe();

    const sessionsSub = supabase
      .channel('sessions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        loadSessions();
        loadTables();
        loadDashboard();
        loadReport();
      })
      .subscribe();

    const tablesSub = supabase
      .channel('tables-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        loadTables();
        loadDashboard();
      })
      .subscribe();

    const paymentsSub = supabase
      .channel('payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (payload: any) => {
        loadOrders();   // Trigger kitchen board updates for 'Pay First' orders
        loadSessions(); // Trigger session accounting updates
        loadTables();   // Trigger table card payment status updates

        // Notify admin of newly submitted payments awaiting verification
        if (payload.eventType === 'UPDATE' && payload.new?.status === 'verified') {
          playPaymentReceived();
          showNotification('Payment Pending Review', `A customer submitted a payment code. Please verify it.`);
        }
      })
      .subscribe();

    const auditSub = supabase
      .channel('audit-logs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_audit_logs' }, () => {
        loadAuditLogs();
      })
      .subscribe();

    // Request notification permission once admin is logged in
    requestNotificationPermission();

    return () => {
      ordersSub.unsubscribe();
      sessionsSub.unsubscribe();
      tablesSub.unsubscribe();
      paymentsSub.unsubscribe();
      auditSub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getFreshToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || localStorage.getItem('admin_token') || '';
    // Optional: Keep localStorage in sync if it changed
    if (session?.access_token && session.access_token !== localStorage.getItem('admin_token')) {
      localStorage.setItem('admin_token', session.access_token);
    }
    return token;
  };

  const loadData = async () => {
    setLoading(true);

    // Refresh user profile from DB to ensure it matches the admin list
    if (user?.id) {
      const { data: profile } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        const token = await getFreshToken();
        setAuth({
          ...user,
          full_name: profile.full_name,
          username: profile.username,
          role: profile.role
        }, token);
      }
    }

    // Fetch sequentially to prevent Supabase Auth lock collisions
    await loadOrders();
    await loadSessions();
    await loadTables();
    await loadReport();
    await loadMenu();
    await loadDashboard();
    await loadAdminUsers();
    await loadAuditLogs();

    setLoading(false);
  };

  // Trigger animations after loading completes
  useEffect(() => {
    if (!loading && isClient) {
      // Small timeout to ensure DOM is rendered
      const timer = setTimeout(() => {
        const targets = document.querySelectorAll('.af');
        if (targets.length > 0) {
          gsap.fromTo('.af',
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }
          );
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, isClient]);

  const loadOrders = async () => { 
    if (activeTab === 'kitchen') {
      const { data } = await orderAPI.getKitchenOrders(); 
      if (data && Array.isArray(data)) setOrders(data); 
    } else {
      const { data } = await orderAPI.getAll(); 
      if (data && Array.isArray(data)) setOrders(data); 
    }
  };
  const loadSessions = async () => { const { data } = await adminAPI.getSessions(); if (data && Array.isArray(data)) setSessions(data); };
  const loadTables = async () => {
    const { data } = await adminAPI.getTables();
    if (data && Array.isArray(data)) {
      setTables(data);

      // Proactively fetch session orders for all occupied tables to fix the "0 orders" issue
      const occupiedTables = data.filter(t => t.session_id);
      for (const table of occupiedTables) {
        // Always refresh session orders to ensure totals stay in sync
        orderAPI.getSessionOrders(table.session_id).then(res => {
          const fetchedOrders = res.data;
          if (fetchedOrders) {
            setSessionOrders(prev => ({ ...prev, [table.session_id]: fetchedOrders }));
          }
        });
      }
    }
  };
  const loadReport = async () => { const { data } = await adminAPI.getReport(); if (data) setReport(data); };
  const loadMenu = async () => {
    const { data } = await menuAPI.getAll();
    if (data && Array.isArray(data)) {
      console.log('Menu items loaded:', data.length);
      if (data.length > 0) {
        console.log('Sample menu item:', data[0]);
      }
      setMenuItems(data);
    }
  };
  const loadDashboard = async () => {
    const storedUser = localStorage.getItem('admin_user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (userData?.role === 'kitchen') return;
      } catch (err) {
        console.error('Error parsing user in dashboard load:', err);
      }
    }
    const { data } = await adminAPI.getDashboard();
    if (data) setDashboard(data);
  };
  const loadAdminUsers = async () => {
    const storedUser = localStorage.getItem('admin_user');
    if (!storedUser) return;
    try {
      const userData = JSON.parse(storedUser);
      if (userData?.role !== 'super_admin' && userData?.role !== 'admin') return;
    } catch (err) {
      console.error('Error parsing user in admin load:', err);
      return;
    }
    const { data } = await adminAPI.getAdminUsers();
    if (data && Array.isArray(data)) setAdminUsers(data);
  };

  const loadAuditLogs = async () => {
    const storedUser = localStorage.getItem('admin_user');
    if (!storedUser) return;
    try {
      const userData = JSON.parse(storedUser);
      if (userData?.role === 'kitchen') return;
    } catch (err) {}
    const { data } = await adminAPI.getAuditLogs();
    if (data && Array.isArray(data)) setAuditLogs(data);
  };

  const handleLogout = async () => {
    await adminAPI.logout();
    logout();
    router.push('/admin/login');
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    const token = await getFreshToken();
    const { error } = await actions.updateOrderStatus(orderId, status, token);
    if (!error) {
      updateOrderStatus(orderId, status);
      playSuccess();
    } else {
      setAdminToast({ message: 'Failed to update status: ' + error, type: 'error' });
      playError();
    }
  };

  const handleSwipeTicket = (orderId: number, direction: 'left' | 'right') => {
    const el = ticketRefs.current[orderId.toString()];
    if (!el) return;
    gsap.to(el, {
      x: direction === 'right' ? 320 : -320, opacity: 0, duration: 0.4, ease: 'back.in(1.7)',
      onComplete: () => {
        handleStatusChange(orderId, direction === 'right' ? 'ready' : 'preparing');
        gsap.set(el, { x: 0, opacity: 1 });
      },
    });
  };

  const handleToggleAvailability = async (itemId: number, cur: boolean) => {
    const token = await getFreshToken();
    const { error } = await actions.toggleMenuItemAvailability(itemId, !cur, token);
    if (!error) setMenuItems(items => items.map(i => i.id === itemId ? { ...i, is_available: !cur } : i));
    else setAdminToast({ message: 'Failed to update availability: ' + error, type: 'error' });
  };

  const handlePayment = async (sessionId: number, method: string = 'cash') => {
    // Calculate totals for confirmation
    const session = tables.find(t => t.session_id === sessionId);
    if (!session) return;

    // Resilient calculation from loaded orders
    const orders = sessionOrders[sessionId] || [];
    const calculatedSubtotal = orders.reduce((sum: number, o: any) =>
      sum + (o.items?.reduce((os: number, i: any) => os + (i.quantity * i.unit_price), 0) || 0), 0
    );

    const sub = calculatedSubtotal || Number(session.subtotal) || 0;
    const v = sub * 0.15;
    const s = sub * 0.10;
    const tot = sub + v + s;

    const confirmed = await dialog.showConfirm(
      `Confirm ${method.charAt(0).toUpperCase() + method.slice(1)} Payment`,
      `Subtotal: ${sub.toFixed(0)} ETB\nVAT (15%): ${v.toFixed(0)} ETB\nService (10%): ${s.toFixed(0)} ETB\nTotal: ${tot.toFixed(0)} ETB`,
      { confirmLabel: 'Confirm Payment' }
    );
    if (!confirmed) return;

    const token = await getFreshToken();
    const { data, error } = await actions.confirmPaymentAction(sessionId, method, token);
    if (!error && data) {
      setExpandedTable(null);
      setSessionOrders(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      loadTables(); loadSessions(); loadReport(); loadDashboard();
      playSuccess();
      setAdminToast({ message: 'Payment confirmed successfully!', type: 'success' });
    } else {
      playError();
      setAdminToast({ message: 'Payment failed: ' + (error || 'Unknown error'), type: 'error' });
    }
  };

  const handleExpandTable = async (table: any) => {
    if (!table.session_id) return;
    const isOpen = expandedTable === table.id;
    setExpandedTable(isOpen ? null : table.id);
    if (!isOpen && !sessionOrders[table.session_id]) {
      const { data } = await adminAPI.getSessionDetail(table.session_id);
      const fetchedOrders = data?.orders;
      if (fetchedOrders) {
        setSessionOrders(prev => ({ ...prev, [table.session_id]: fetchedOrders }));
      }
    }
  };

  /**
   * EMERGENCY: Close every open session at once, then download a JSON snapshot
   * so the manager can settle bills manually after a power/Wi-Fi outage.
   */
  const handleBulkClose = async () => {
    const occupiedCount = tables.filter(t => t.table_status === 'occupied' || !!t.session_id).length;
    if (occupiedCount === 0) {
      setAdminToast({ message: 'No open sessions to close.', type: 'info' });
      return;
    }

    const confirmed = await dialog.showDestructive(
      '⚡ Emergency: Close All Sessions',
      `This will immediately cancel all ${occupiedCount} active session(s) and release every table.\n\nA JSON snapshot will be downloaded so you can manually settle bills offline.\n\nProceed?`,
      { confirmLabel: `Close All ${occupiedCount} Session(s)` }
    );
    if (!confirmed) return;

    const reason = await dialog.showPrompt(
      'Reason for Emergency Close',
      'Please enter a reason (e.g. "Power outage", "End of shift"):',
      { confirmLabel: 'Confirm & Close All', placeholder: 'Reason (required)' }
    );
    if (!reason || reason.trim() === '') {
      if (reason !== null) setAdminToast({ message: 'A reason is required.', type: 'error' });
      return;
    }

    setBulkCloseLoading(true);
    const token = await getFreshToken();
    const result = await actions.bulkCloseSessionsAction(reason.trim(), token);
    setBulkCloseLoading(false);

    if (result.error) {
      setAdminToast({ message: 'Bulk close failed: ' + result.error, type: 'error' });
      return;
    }

    // Download snapshot as JSON
    if (result.exportedSnapshot && result.exportedSnapshot.length > 0) {
      const blob = new Blob(
        [JSON.stringify(result.exportedSnapshot, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eset-sessions-snapshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }

    loadTables();
    loadSessions();
    loadDashboard();
    setExpandedTable(null);
    setSessionOrders({});
    setAdminToast({
      message: `Closed ${result.closed} session(s).${result.failed ? ` ${result.failed} failed.` : ''} Snapshot downloaded.`,
      type: result.failed ? 'error' : 'success'
    });
  };

  const handleCancelSession = async (sessionId: number, tableNumber: number) => {
    const reason = await dialog.showPrompt(
      'Cancel Session',
      `Cancel session for Table ${tableNumber}? All pending and preparing orders will be voided.\nPlease provide a reason for cancellation:`,
      { confirmLabel: 'Cancel Session', placeholder: 'Reason (required)' }
    );
    if (!reason || reason.trim() === '') {
      if (reason !== null) setAdminToast({ message: 'Cancellation reason is required.', type: 'error' });
      return;
    }
    const token = await getFreshToken();
    const { error } = await actions.cancelSessionAction(sessionId, token, reason);
    if (!error) {
      setExpandedTable(null);
      setSessionOrders(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
      loadTables(); loadSessions();
      setAdminToast({ message: `Session for Table ${tableNumber} cancelled.`, type: 'info' });
    } else {
      setAdminToast({ message: 'Failed to cancel session: ' + error, type: 'error' });
    }
  };

  const handleResetDashboard = async () => {
    if (!user || user.role !== 'super_admin') {
      await dialog.showAlert('Permission Denied', 'You do not have permission to perform this action. Only Super Admins can reset the dashboard.');
      return;
    }

    const firstConfirm = await dialog.showDestructive(
      'Reset Dashboard Data',
      'CRITICAL WARNING: This will permanently DELETE all sales history, order history, and active sessions. This cannot be undone.\n\nAre you absolutely sure?',
      { confirmLabel: 'I Understand, Continue' }
    );
    if (!firstConfirm) return;

    const secondConfirm = await dialog.showPrompt(
      'Final Confirmation',
      'Please type "RESET" to confirm data deletion.',
      { placeholder: 'Type RESET here', requiredMatch: 'RESET', confirmLabel: 'Reset Everything' }
    );
    if (secondConfirm !== 'RESET') {
      setAdminToast({ message: 'Reset cancelled.', type: 'info' });
      return;
    }

    setResettingData(true);
    const token = await getFreshToken();
    const { success, error } = await actions.resetDashboardData(token);
    setResettingData(false);

    if (success) {
      setAdminToast({ message: 'Dashboard data has been reset successfully.', type: 'success' });
      await loadData();
    } else {
      setAdminToast({ message: 'Failed to reset dashboard: ' + error, type: 'error' });
    }
  };

  const getSessionDuration = (openedAt: string) => {
    const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };


  // Menu CMS handlers
  const handleOpenMenuModal = (item?: any) => {
    if (item) {
      setEditingItem(item);
      setMenuForm({
        name: item.name,
        category: item.category,
        description: item.description,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients.join(', ') : '',
        price: item.price.toString(),
        image_url: item.image_url || '',
        is_available: item.is_available,
        is_signature: item.is_signature || false,
        stock_quantity: (item.stock_quantity ?? 999).toString(),
      });
      setImagePreview(item.image_url || null);
    } else {
      setEditingItem(null);
      setMenuForm({
        name: '',
        category: 'coffee',
        description: '',
        ingredients: '',
        price: '',
        image_url: '',
        is_available: true,
        is_signature: false,
        stock_quantity: '999',
      });
      setImagePreview(null);
    }
    setShowMenuModal(true);
  };

  const handleCloseMenuModal = () => {
    setShowMenuModal(false);
    setEditingItem(null);
    setImagePreview(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setAdminToast({ message: 'Please select an image file', type: 'error' });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setAdminToast({ message: 'Image must be less than 5MB', type: 'error' });
      return;
    }

    setUploadingImage(true);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    const { data, error } = await uploadAPI.uploadImage(file);
    setUploadingImage(false);

    if (error) {
      setAdminToast({ message: 'Failed to upload image: ' + error, type: 'error' });
      setImagePreview(null);
      return;
    }

    if (data) {
      console.log('Server Upload Success:', data.url);
      setMenuForm(prev => {
        console.log('Updating menuForm image_url from', prev.image_url, 'to', data.url);
        return { ...prev, image_url: data.url };
      });
      // Don't set imagePreview to data.url immediately if we already have a base64 preview
      // that is working. This prevents the "disappearing image" if publicUrl takes a second to propagate.
      // We'll only update it if it's not already showing something.
      if (!imagePreview) setImagePreview(data.url);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setMenuForm(prev => ({ ...prev, image_url: '' }));
  };

  const handleSaveMenuItem = async () => {
    if (!menuForm.name || !menuForm.description || !menuForm.price) {
      setAdminToast({ message: 'Please fill in all required fields (Name, Description, Price).', type: 'error' });
      return;
    }

    if (!menuForm.name || !menuForm.price) {
      setAdminToast({ message: 'Name and Price are required.', type: 'error' });
      return;
    }

    const priceNum = parseFloat(menuForm.price);
    if (isNaN(priceNum)) {
      setAdminToast({ message: 'Price must be a valid number.', type: 'error' });
      return;
    }

    const itemData = {
      ...menuForm,
      ingredients: menuForm.ingredients.split(',').map(i => i.trim()).filter(Boolean),
      price: priceNum,
      stock_quantity: parseInt(menuForm.stock_quantity) || 0,
    };

    const payload = { ...itemData };
    console.log('Final Payload to Server:', payload);
    if (editingItem) console.log('Target ID:', editingItem.id);

    if (editingItem) {
      const token = await getFreshToken();
      const result = await actions.saveMenuItem(payload, editingItem.id, token);
      if (result.success) {
        console.log('Update result: Success');
        await loadMenu();
        handleCloseMenuModal();
      } else {
        console.error('Update result: Error', result.error);
        setAdminToast({ message: 'Failed to update menu item: ' + result.error, type: 'error' });
      }
    } else {
      const token = await getFreshToken();
      const result = await actions.saveMenuItem(payload, undefined, token);
      if (result.success) {
        console.log('Create result: Success');
        await loadMenu();
        handleCloseMenuModal();
      } else {
        console.error('Create result: Error', result.error);
        setAdminToast({ message: 'Failed to create menu item: ' + result.error, type: 'error' });
      }
    }
  };

  const handleDeleteMenuItem = async (id: number) => {
    console.log('Attempting to delete menu item:', id);
    const confirmed = await dialog.showDestructive(
      'Delete Menu Item',
      'Are you sure you want to delete this menu item? This cannot be undone.',
      { confirmLabel: 'Delete Item' }
    );
    if (!confirmed) return;

    const token = await getFreshToken();
    const { error } = await actions.deleteMenuItem(id, token);
    console.log('Menu delete result:', { error });
    if (!error) {
      loadMenu();
      setAdminToast({ message: 'Menu item deleted.', type: 'success' });
    } else {
      setAdminToast({ message: 'Failed to delete menu item: ' + error, type: 'error' });
    }
  };

  // Admin management handlers
  const handleOpenAdminModal = (admin?: any) => {
    if (admin) {
      setEditingAdmin(admin);
      setAdminForm({
        username: admin.username,
        password: '',
        role: admin.role,
        full_name: admin.full_name || '',
      });
    } else {
      setEditingAdmin(null);
      setAdminForm({
        username: '',
        password: '',
        role: 'kitchen',
        full_name: '',
      });
    }
    setShowAdminModal(true);
  };

  const handleCloseAdminModal = () => {
    setShowAdminModal(false);
    setEditingAdmin(null);
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.username) {
      setAdminToast({ message: 'Username is required.', type: 'error' });
      return;
    }
    if (!editingAdmin && !adminForm.password) {
      setAdminToast({ message: 'Password is required for new users.', type: 'error' });
      return;
    }
    setAdminSaving(true);
    if (editingAdmin) {
      const token = await getFreshToken();
      const { error } = await actions.saveAdminAction(adminForm, editingAdmin.id, token);
      setAdminSaving(false);
      if (!error) {
        await loadAdminUsers();
        handleCloseAdminModal();
        setAdminToast({ message: 'Admin user updated.', type: 'success' });
      } else {
        if (error.includes('23505')) {
          setAdminToast({ message: 'This username/email is already taken by another admin.', type: 'error' });
        } else {
          setAdminToast({ message: 'Failed to update admin: ' + error, type: 'error' });
        }
      }
    } else {
      const token = await getFreshToken();
      const { error } = await actions.saveAdminAction(adminForm, undefined, token);
      setAdminSaving(false);
      if (!error) {
        await loadAdminUsers();
        handleCloseAdminModal();
        setAdminToast({ message: 'Admin user created.', type: 'success' });
      } else {
        if (error.includes('23505')) {
          setAdminToast({ message: 'This username/email is already taken by another admin.', type: 'error' });
        } else {
          setAdminToast({ message: 'Failed to create admin: ' + error, type: 'error' });
        }
      }
    }
  };

  const handleDeleteAdmin = async (id: string, username: string) => {
    console.log('Attempting to delete admin:', { id, username });
    if (username === user?.username) {
      await dialog.showAlert('Cannot Delete', 'You cannot delete your own account.');
      return;
    }
    const confirmed = await dialog.showDestructive(
      'Delete Admin User',
      `Delete admin user "${username}"? This cannot be undone.`,
      { confirmLabel: 'Delete User' }
    );
    if (!confirmed) return;
    const token = await getFreshToken();
    const { error } = await actions.deleteAdminAction(id, token);
    console.log('Admin delete result:', { error });
    if (!error) {
      await loadAdminUsers();
      setAdminToast({ message: `Admin "${username}" deleted.`, type: 'success' });
    } else {
      setAdminToast({ message: 'Failed to delete admin user: ' + error, type: 'error' });
    }
  };

  // Table management handlers
  const handleAddTable = async () => {
    const num = parseInt(newTableNumber);
    if (!num || num < 1) { setAdminToast({ message: 'Enter a valid table number.', type: 'error' }); return; }
    setTableActionLoading(-1);
    const token = await getFreshToken();
    const { data, error } = await actions.createTableAction(num, token);
    setTableActionLoading(null);
    if (!error && data) {
      setNewTableNumber('');
      setAddingTable(false);
      await loadTables();
      setAdminToast({ message: `Table ${num} added.`, type: 'success' });
    } else {
      setAdminToast({ message: 'Failed to add table: ' + error, type: 'error' });
    }
  };

  const handleDeleteTable = async (tableId: number, tableNumber: number, status: string) => {
    console.log('Attempting to delete table:', { tableId, tableNumber });
    if (status === 'occupied') {
      await dialog.showAlert('Cannot Delete', 'Cannot delete an occupied table. Cancel the session first.');
      return;
    }
    const confirmed = await dialog.showDestructive(
      'Delete Table',
      `Delete Table ${tableNumber}? This cannot be undone.`,
      { confirmLabel: 'Delete Table' }
    );
    if (!confirmed) return;
    setTableActionLoading(tableId);
    const token = await getFreshToken();
    const { error } = await actions.deleteTableAction(tableId, token);
    console.log('Table delete result:', { error });
    setTableActionLoading(null);
    if (!error) {
      await loadTables();
      setAdminToast({ message: `Table ${tableNumber} deleted.`, type: 'success' });
    } else {
      setAdminToast({ message: 'Failed to delete table: ' + error, type: 'error' });
    }
  };

  const handleDownloadQR = async (tableNumber: number, token: string) => {
    const QRCode = (await import('qrcode')).default;
    const menuUrl = `${window.location.origin}/menu?table=${tableNumber}&token=${token}`;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.roundRect(0, 0, 400, 480, 20);
    ctx.fill();

    // QR code into temp canvas
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, menuUrl, { width: 320, margin: 1, color: { dark: '#05503c', light: '#ffffff' } });
    ctx.drawImage(qrCanvas, 40, 40);

    // Label
    ctx.fillStyle = '#05503c';
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`Table ${tableNumber}`, 200, 400);
    ctx.fillStyle = '#fdca00';
    ctx.font = 'bold 14px system-ui';
    ctx.fillText('ESET Cafe — Scan to order', 200, 428);
    ctx.fillStyle = 'rgba(5,80,60,0.35)';
    ctx.font = '10px system-ui';
    ctx.fillText(menuUrl, 200, 460);

    const link = document.createElement('a');
    link.download = `table-${tableNumber}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const ordersByStatus = {
    pending: Array.isArray(orders) ? orders.filter((o: any) => o.status === 'pending') : [],
    preparing: Array.isArray(orders) ? orders.filter((o: any) => o.status === 'preparing') : [],
    ready: Array.isArray(orders) ? orders.filter((o: any) => o.status === 'ready') : [],
  };

  // Draggable kitchen tickets
  useEffect(() => {
    if (activeTab !== 'kitchen' || !Array.isArray(orders)) return;
    orders.forEach((order: any) => {
      if (!order?.id) return;
      const el = ticketRefs.current[order.id.toString()];
      if (el && order.status !== 'ready') {
        Draggable.create(el, {
          type: 'x',
          bounds: { minX: -200, maxX: 200 },
          onDragEnd: function () {
            if (this.x > 100) handleSwipeTicket(order.id, 'right');
            else if (this.x < -100) handleSwipeTicket(order.id, 'left');
            else gsap.to(el, { x: 0, duration: 0.3 });
          },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, activeTab]);

  const userRole = (user?.role || 'manager') as keyof typeof ROLE_STYLES;
  const roleStyle = ROLE_STYLES[userRole] || ROLE_STYLES.manager;
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.username?.split('@')[0]?.slice(0, 2).toUpperCase() || 'AD';

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100svh', background: '#F9F9F9', color: '#05503c', fontFamily: 'var(--font-instrument), system-ui, sans-serif' }}>

      {/* ── AMBIENT GLOWS (purely decorative, pointer-events: none) ── */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,202,0,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(5,80,60,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* ── MOBILE TOP BAR ─────────────────────────────────────── */}
      <header className="admin-topbar" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.85rem 1.25rem',
        background: 'rgba(249,249,249,0.88)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(5,80,60,0.07)',
        boxShadow: '0 2px 16px rgba(5,80,60,0.04)',
      }}>
        {/* Hamburger — hidden on lg */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          aria-label="Toggle menu"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(5,80,60,0.06)', border: 'none', cursor: 'pointer', color: '#05503c',
          }}
          className="lg-hide-btn"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Logo */}
        <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.04em', color: '#05503c' }}>
          ESET <span style={{ color: '#fdca00' }}>Admin</span>
        </span>

        {/* User avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(253,202,0,0.2), rgba(253,202,0,0.05))',
          border: '1.5px solid rgba(253,202,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.8rem', color: '#05503c',
        }}>
          {initials}
        </div>
      </header>

      {/* ── LAYOUT WRAPPER ─────────────────────────────────────── */}
      <div style={{ display: 'flex', minHeight: '100svh', position: 'relative', zIndex: 1 }}>

        {/* ── SIDEBAR OVERLAY (mobile) ────────────────────────── */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(5,80,60,0.25)', backdropFilter: 'blur(8px)' }}
          />
        )}

        {/* ── SIDEBAR ────────────────────────────────────────────
            On mobile: slides in from left (fixed overlay)
            On desktop (lg+): always visible, sticky           */}
        <aside className={`admin-sidebar${sidebarOpen ? ' admin-sidebar--open' : ''}`} style={{ zIndex: 100 }}>
          {/* Brand */}
          <div style={{ padding: 'max(1.5rem, env(safe-area-inset-top)) 1.5rem 1.5rem', borderBottom: '1px solid rgba(5,80,60,0.07)' }}>
            <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.04em', color: '#05503c' }}>
              ESET <span style={{ color: '#fdca00' }}>Admin</span>
            </p>
            <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.35)', marginTop: '0.3rem' }}>
              Management Suite
            </p>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {NAV_ITEMS.filter(item => !user?.role || item.roles.includes(user.role as any)).map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.85rem',
                    padding: '0.85rem 1.1rem', borderRadius: 16, border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.9rem',
                    letterSpacing: '-0.01em',
                    background: active ? 'linear-gradient(135deg, #fdca00 0%, #ffd845 100%)' : 'transparent',
                    color: active ? '#05503c' : 'rgba(5,80,60,0.5)',
                    boxShadow: active ? '0 4px 20px rgba(253,202,0,0.28)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.05)'; (e.currentTarget as HTMLElement).style.color = '#05503c'; }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(5,80,60,0.5)'; } }}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 1.75} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* User + Logout */}
          <div style={{ padding: '1.25rem 1rem 1.5rem', borderTop: '1px solid rgba(5,80,60,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: roleStyle.bg,
                border: `1.5px solid ${roleStyle.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem',
                color: roleStyle.text,
                boxShadow: roleStyle.glow,
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{
                  fontFamily: 'var(--font-bricolage)',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  color: '#05503c',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.02em'
                }}>
                  {user?.full_name || 'Admin User'}
                </p>
                <p style={{
                  fontSize: '0.68rem',
                  color: 'rgba(5,80,60,0.45)',
                  fontWeight: 500,
                  marginTop: '0.05rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {user?.username}
                </p>
                <div style={{
                  display: 'inline-block', marginTop: '0.45rem',
                  padding: '0.15rem 0.55rem', borderRadius: 6,
                  fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: roleStyle.bg,
                  color: roleStyle.text,
                  border: `1px solid ${roleStyle.border}`,
                }}>
                  {roleStyle.label}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem',
                padding: '0.75rem 1rem', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer',
                fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.78rem',
                letterSpacing: '0.04em', textTransform: 'uppercase',
                transition: 'background 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'; }}
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ───────────────────────────────────────── */}
        <main style={{ flex: 1, paddingTop: '4.5rem', paddingBottom: '6rem', overflowX: 'hidden' }} className="admin-main">

          {/* Page header */}
          <div style={{ padding: '2rem 1.5rem 1.5rem' }} className="admin-page-header">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#fdca00', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {currentDate}
                </p>
                <h1 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', letterSpacing: '-0.04em', lineHeight: 1.1, color: '#05503c' }}>
                  {NAV_ITEMS.find(n => n.id === activeTab)?.label}
                </h1>
              </div>
              <button
                onClick={loadData}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.6rem 1.1rem', borderRadius: 10,
                  background: 'rgba(5,80,60,0.06)', border: '1px solid rgba(5,80,60,0.1)',
                  color: '#05503c', cursor: 'pointer',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.78rem',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.06)'}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(5,80,60,0.07)', marginTop: '1.5rem' }} />
          </div>

          {/* ── CONTENT AREA ─────────────────────────────────────── */}
          <div style={{ padding: '0 1.5rem' }}>
            {loading ? (
              <div style={{ minHeight: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', opacity: 0.5 }}>
                <RefreshCw size={28} style={{ color: '#fdca00', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                  Loading Data…
                </p>
              </div>
            ) : (
              <div className="af">

                {/* ════ DASHBOARD VIEW ════════════════════════════ */}
                {activeTab === 'dashboard' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {!dashboard ? (
                      <div style={{
                        padding: '3rem 2rem',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.75)',
                        borderRadius: 18,
                        border: '1px solid rgba(5,80,60,0.07)',
                      }}>
                        <LayoutGrid size={32} style={{ color: 'rgba(5,80,60,0.2)', marginBottom: '1rem' }} />
                        <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.3)' }}>Loading dashboard data...</p>
                      </div>
                    ) : (
                      <>
                        {/* Quick Stats Grid */}
                        <div className="admin-stat-grid">
                          {[
                            { label: 'Today\'s Revenue', val: `${Number(dashboard.total_sales || 0).toLocaleString()} ETB`, icon: DollarSign, accent: '#fdca00' },
                            { label: 'Active Sessions', val: dashboard.active_sessions || 0, icon: Users, accent: '#05503c' },
                            { label: 'Orders Today', val: dashboard.orders_count || 0, icon: ShoppingBag, accent: '#ef4444' },
                            { label: 'Growth Status', val: 'Healthy', icon: CheckCircle, accent: '#22c55e' },
                          ].map((stat, i) => {
                            const Icon = stat.icon;
                            return (
                              <div key={i} className="af glass-card-admin" style={{ borderRadius: 22, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stat.accent, borderRadius: '22px 22px 0 0' }} />
                                <div style={{
                                  width: 40, height: 40, borderRadius: 12, marginBottom: '1.25rem',
                                  background: `${stat.accent}18`,
                                  border: `1px solid ${stat.accent}30`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Icon size={18} style={{ color: stat.accent }} strokeWidth={1.75} />
                                </div>
                                <p style={{ fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)', marginBottom: '0.4rem' }}>
                                  {stat.label}
                                </p>
                                <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: 'clamp(1.3rem, 3vw, 2rem)', letterSpacing: '-0.03em', color: '#05503c' }}>
                                  {stat.val}
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        {/* Two Column Layout */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }} className="dashboard-two-col">

                          {/* Top Selling Items */}
                          <div className="glass-card-admin" style={{ borderRadius: 22 }}>
                            <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#05503c', marginBottom: '1.25rem' }}>
                              Top Selling Today
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {dashboard.top_items && dashboard.top_items.length > 0 ? dashboard.top_items.map((item: any, i: number) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '0.85rem 1rem',
                                  background: 'rgba(5,80,60,0.03)', borderRadius: 14,
                                  border: '1px solid rgba(5,80,60,0.06)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem', color: 'rgba(5,80,60,0.08)', minWidth: 28 }}>
                                      {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <div>
                                      <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.92rem', color: '#05503c' }}>{item.name}</p>
                                      <p style={{ fontSize: '0.68rem', color: 'rgba(5,80,60,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.category}</p>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.1rem', color: '#fdca00' }}>{item.total_sold}</p>
                                    <p style={{ fontSize: '0.6rem', color: 'rgba(5,80,60,0.35)', textTransform: 'uppercase' }}>sold</p>
                                  </div>
                                </div>
                              )) : (
                                <p style={{ textAlign: 'center', padding: '2rem', color: 'rgba(5,80,60,0.3)', fontSize: '0.9rem' }}>No sales yet today</p>
                              )}
                            </div>
                          </div>

                          {/* Recent Orders */}
                          <div className="glass-card-admin" style={{ borderRadius: 22 }}>
                            <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#05503c', marginBottom: '1.25rem' }}>
                              Recent Activity
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {dashboard.recent_orders && dashboard.recent_orders.length > 0 ? dashboard.recent_orders.slice(0, 5).map((order: any) => (
                                <div key={order.id} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '0.85rem 1rem',
                                  background: 'rgba(5,80,60,0.03)', borderRadius: 14,
                                  border: '1px solid rgba(5,80,60,0.06)',
                                }}>
                                  <div>
                                    <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.92rem', color: '#05503c' }}>
                                      Table {order.table_number}
                                    </p>
                                    <p style={{ fontSize: '0.68rem', color: 'rgba(5,80,60,0.4)' }}>
                                      {order.item_count} items · {new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                  <span style={{
                                    padding: '0.3rem 0.8rem', borderRadius: 999,
                                    background: order.status === 'pending' ? 'rgba(253,202,0,0.12)' : order.status === 'preparing' ? 'rgba(5,80,60,0.1)' : 'rgba(34,197,94,0.12)',
                                    color: order.status === 'pending' ? '#fdca00' : order.status === 'preparing' ? '#05503c' : '#22c55e',
                                    fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.65rem',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                  }}>
                                    {order.status}
                                  </span>
                                </div>
                              )) : (
                                <p style={{ textAlign: 'center', padding: '2rem', color: 'rgba(5,80,60,0.3)', fontSize: '0.9rem' }}>No recent orders</p>
                              )}
                            </div>
                          </div>

                          {/* Active Sessions Control */}
                          <div className="glass-card-admin" style={{ borderRadius: 22, gridColumn: 'span 2' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                              <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#05503c' }}>
                                Active Table Sessions
                              </h2>
                              <Link href="#" onClick={(e) => { e.preventDefault(); setActiveTab('sessions'); }} style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fdca00', textDecoration: 'none' }}>
                                View All Tables
                              </Link>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                              {tables.filter(t => t.table_status === 'occupied' || !!t.session_id).length > 0 ? (
                                tables.filter(t => t.table_status === 'occupied' || !!t.session_id).map(table => (
                                  <div key={table.id} style={{
                                    padding: '1.25rem',
                                    background: 'rgba(253,202,0,0.04)',
                                    borderRadius: 18,
                                    border: '1px solid rgba(253,202,0,0.2)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem'
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                      <div>
                                        <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.4rem', color: '#05503c', lineHeight: 1 }}>
                                          Table {table.table_number}
                                        </p>
                                        <p style={{ fontSize: '0.65rem', color: 'rgba(5,80,60,0.4)', marginTop: '0.25rem' }}>
                                          Active for {getSessionDuration(table.opened_at)}
                                        </p>
                                      </div>
                                      <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.1rem', color: '#05503c' }}>
                                          {(() => {
                                            const orders = sessionOrders[table.session_id] || [];
                                            const calculatedSubtotal = orders.reduce((sum: number, o: any) =>
                                              sum + (o.items?.reduce((os: number, i: any) => os + (i.quantity * i.unit_price), 0) || 0), 0
                                            );
                                            const sub = calculatedSubtotal || Number(table.subtotal) || 0;
                                            return (sub * 1.25).toFixed(0);
                                          })()} ETB
                                        </p>
                                        <p style={{ fontSize: '0.6rem', color: 'rgba(5,80,60,0.35)', textTransform: 'uppercase' }}>Current Total</p>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                      <button
                                        onClick={() => handleExpandTable(table).then(() => setActiveTab('sessions'))}
                                        style={{
                                          flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(5,80,60,0.1)',
                                          background: '#fff', color: '#05503c', cursor: 'pointer',
                                          fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.75rem'
                                        }}
                                      >
                                        Manage Bill
                                      </button>
                                      <button
                                        onClick={() => handleCancelSession(table.session_id, table.table_number)}
                                        style={{
                                          padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)',
                                          background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                        title="Force Close Session"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div style={{
                                  gridColumn: '1 / -1',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  textAlign: 'center',
                                  padding: '4rem 2rem',
                                  background: 'rgba(5,80,60,0.02)',
                                  borderRadius: 24,
                                  border: '1px dashed rgba(5,80,60,0.1)',
                                  width: '100%'
                                }}>
                                  <Users size={32} style={{ color: 'rgba(5,80,60,0.15)', marginBottom: '1rem' }} />
                                  <p style={{ color: 'rgba(5,80,60,0.35)', fontSize: '0.95rem', fontWeight: 600 }}>No active sessions right now</p>
                                  <p style={{ color: 'rgba(5,80,60,0.2)', fontSize: '0.8rem', marginTop: '0.25rem' }}>All tables are currently available</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Financial Summary from Reports */}
                        {report && (
                          <div className="glass-card-admin" style={{ borderRadius: 22 }}>
                            <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#05503c', marginBottom: '1.25rem' }}>
                              Financial Summary
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                              {[
                                { label: 'Subtotal', value: `${Number(report.revenue?.total_subtotal || 0).toLocaleString()} ETB`, color: '#05503c' },
                                { label: 'VAT (15%)', value: `${Number(report.revenue?.total_vat || 0).toLocaleString()} ETB`, color: '#22c55e' },
                                { label: 'Service (10%)', value: `${Number(report.revenue?.total_service || 0).toLocaleString()} ETB`, color: '#8b5cf6' },
                                { label: 'Total Revenue', value: `${Number(report.revenue?.total_revenue || 0).toLocaleString()} ETB`, color: '#fdca00' },
                              ].map((stat, i) => (
                                <div key={i} style={{
                                  padding: '1rem',
                                  background: 'rgba(5,80,60,0.03)',
                                  borderRadius: 14,
                                  border: '1px solid rgba(5,80,60,0.06)',
                                }}>
                                  <p style={{ fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)', marginBottom: '0.5rem' }}>
                                    {stat.label}
                                  </p>
                                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.3rem', color: stat.color }}>
                                    {stat.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reset Data Section (Privileged only) */}
                        {(user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'admin') && (
                          <div style={{
                            marginTop: '2rem',
                            padding: '2.5rem',
                            borderRadius: 24,
                            background: 'rgba(239,68,68,0.03)',
                            border: '1.5px dashed rgba(239,68,68,0.15)',
                            textAlign: 'center',
                            maxWidth: '650px',
                            margin: '2rem auto 0'
                          }}>
                            <h3 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.1rem', color: '#ef4444', marginBottom: '0.5rem' }}>
                              Advanced System Management
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: 'rgba(5,80,60,0.45)', marginBottom: '1.5rem', maxWidth: '500px', margin: '0 auto 1.5rem' }}>
                              Clear all histories (sales, orders, sessions) for a fresh start. This action is permanent.
                            </p>
                            <button
                              onClick={handleResetDashboard}
                              disabled={resettingData}
                              className="shimmer-btn"
                              style={{
                                padding: '0.85rem 1.8rem',
                                borderRadius: 14,
                                border: 'none',
                                background: resettingData ? 'rgba(239,68,68,0.3)' : '#ef4444',
                                color: '#fff',
                                fontFamily: 'var(--font-bricolage)',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                cursor: resettingData ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                margin: '0 auto',
                                boxShadow: '0 8px 25px rgba(239,68,68,0.25)'
                              }}
                            >
                              {resettingData ? (
                                <>
                                  <div className="spinner-small" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                                  Resetting...
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={18} />
                                  Reset All Transaction Data
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ════ KITCHEN VIEW ══════════════════════════════ */}
                {activeTab === 'kitchen' && (
                  <div className="admin-kitchen-grid">
                    {Object.entries(ordersByStatus).map(([status, statusOrders]) => {
                      const meta = STATUS_META[status];
                      return (
                        <div key={status} className="af">
                          {/* Column header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <Circle size={8} fill={meta.dot} color={meta.dot} />
                              <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em', color: '#05503c' }}>
                                {meta.label}
                              </h2>
                            </div>
                            <span style={{
                              padding: '0.2rem 0.7rem', borderRadius: 999,
                              background: meta.badge,
                              fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.72rem', color: '#05503c',
                            }}>
                              {statusOrders.length}
                            </span>
                          </div>

                          {/* Ticket list */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {statusOrders.length === 0 ? (
                              <div style={{
                                minHeight: 120, borderRadius: 20,
                                border: '1.5px dashed rgba(5,80,60,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'rgba(5,80,60,0.25)', fontSize: '0.82rem', fontStyle: 'italic',
                              }}>
                                No tickets
                              </div>
                            ) : statusOrders.map((order: any) => (
                              <div
                                key={order.id}
                                ref={el => { ticketRefs.current[order.id.toString()] = el; }}
                                style={{
                                  background: 'rgba(255,255,255,0.75)',
                                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                                  border: '1px solid rgba(5,80,60,0.07)',
                                  borderRadius: 22,
                                  padding: '1.25rem',
                                  boxShadow: '0 4px 24px rgba(5,80,60,0.06)',
                                  cursor: 'grab',
                                  position: 'relative',
                                  overflow: 'hidden',
                                }}
                              >
                                {/* Top accent strip */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: meta.dot, borderRadius: '22px 22px 0 0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingTop: '0.25rem' }}>
                                  <div>
                                    <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.04em', color: '#05503c', lineHeight: 1 }}>
                                      T{order.table_number}
                                    </p>
                                    <p style={{ fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.35)', marginTop: '0.2rem' }}>
                                      Order #{order.id}
                                    </p>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(5,80,60,0.45)' }}>
                                      {new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {order.fulfillment_type === 'pay_first' ? (
                                      <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.5rem', background: 'rgba(253,202,0,0.15)', color: '#a16207', borderRadius: 999 }}>
                                        PAY FIRST (VERIFIED)
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.5rem', background: 'rgba(34,197,94,0.1)', color: '#15803d', borderRadius: 999 }}>
                                        PAY LATER
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div style={{ borderTop: '1px solid rgba(5,80,60,0.06)', paddingTop: '0.85rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                  {order.items.map((item: any) => (
                                    <div key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                                      <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.8rem', color: '#fdca00', minWidth: 24 }}>
                                        {item.quantity}×
                                      </span>
                                      <span style={{ fontSize: '0.92rem', color: '#05503c' }}>{item.name}</span>
                                    </div>
                                  ))}
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  {order.status === 'pending' && (
                                    <button
                                      onClick={() => handleStatusChange(order.id, 'preparing')}
                                      style={{
                                        flex: 1, padding: '0.65rem', borderRadius: 12,
                                        background: 'linear-gradient(135deg, #05503c, #0a6b51)',
                                        border: 'none', color: '#ffffff', cursor: 'pointer',
                                        fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.72rem',
                                        letterSpacing: '0.06em', textTransform: 'uppercase',
                                        boxShadow: '0 4px 12px rgba(5,80,60,0.15)',
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      Start Prep
                                    </button>
                                  )}

                                  {order.status === 'preparing' && (
                                    <button
                                      onClick={() => handleStatusChange(order.id, 'ready')}
                                      style={{
                                        flex: 1, padding: '0.65rem', borderRadius: 12,
                                        background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                                        border: 'none', color: '#05503c', cursor: 'pointer',
                                        fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.72rem',
                                        letterSpacing: '0.06em', textTransform: 'uppercase',
                                        boxShadow: '0 4px 12px rgba(253,202,0,0.25)',
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      Mark Ready
                                    </button>
                                  )}

                                  {order.status === 'ready' && (
                                    <button
                                      onClick={() => handleStatusChange(order.id, 'served')}
                                      style={{
                                        flex: 1, padding: '0.65rem', borderRadius: 12,
                                        background: 'rgba(5,80,60,0.05)', border: '1px solid rgba(5,80,60,0.1)',
                                        color: '#05503c', cursor: 'pointer',
                                        fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.72rem',
                                        letterSpacing: '0.06em', textTransform: 'uppercase',
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      Serve
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ════ SESSIONS VIEW ═════════════════════════════ */}
                {activeTab === 'sessions' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* ─── Emergency Bulk Close Banner ─── */}
                    {tables.filter(t => t.table_status === 'occupied' || !!t.session_id).length > 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
                        padding: '1rem 1.25rem',
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.03))',
                        border: '1.5px solid rgba(239,68,68,0.18)',
                        borderRadius: 18,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                          </div>
                          <div>
                            <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem', color: '#ef4444' }}>
                              Emergency Close
                            </p>
                            <p style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.45)', marginTop: '0.1rem' }}>
                              Power out / shift end? Close all sessions instantly and download a billing snapshot.
                            </p>
                          </div>
                        </div>
                        <button
                          id="btn-bulk-close-sessions"
                          onClick={handleBulkClose}
                          disabled={bulkCloseLoading}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.65rem 1.25rem', borderRadius: 12, border: 'none',
                            background: bulkCloseLoading ? 'rgba(239,68,68,0.3)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#fff', cursor: bulkCloseLoading ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.8rem',
                            boxShadow: '0 4px 16px rgba(239,68,68,0.25)',
                            transition: 'all 0.2s ease',
                            flexShrink: 0,
                          }}
                        >
                          <Zap size={14} />
                          {bulkCloseLoading ? 'Closing…' : 'Close All & Export'}
                        </button>
                      </div>
                    )}

                    {/* Summary bar + Add Table */}
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                        {[
                          { label: 'Total Tables', val: tables.length, color: '#05503c' },
                          { label: 'Occupied', val: tables.filter(t => t.table_status === 'occupied').length, color: '#fdca00' },
                          { label: 'Available', val: tables.filter(t => t.table_status === 'available').length, color: '#22c55e' },
                          { label: 'Orders Pending', val: tables.reduce((s, t) => s + (Number(t.pending_count) || 0), 0), color: '#ef4444' },
                        ].map((stat, i) => (
                          <div key={i} style={{
                            flex: '1 1 100px', padding: '0.85rem 1.1rem', borderRadius: 16,
                            background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(5,80,60,0.07)',
                            boxShadow: '0 2px 12px rgba(5,80,60,0.04)',
                          }}>
                            <p style={{ fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)', marginBottom: '0.3rem' }}>{stat.label}</p>
                            <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.04em', color: stat.color, lineHeight: 1 }}>{stat.val}</p>
                          </div>
                        ))}
                      </div>

                      {/* Add table control — super_admin only */}
                      {(user?.role === 'super_admin' || user?.role === 'admin') && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                          {addingTable ? (
                            <>
                              <input
                                type="number"
                                min={1}
                                value={newTableNumber}
                                onChange={e => setNewTableNumber(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTable()}
                                placeholder="Table #"
                                autoFocus
                                style={{
                                  width: 90, padding: '0.65rem 0.85rem', borderRadius: 12,
                                  border: '1px solid rgba(5,80,60,0.2)', outline: 'none',
                                  fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.9rem', color: '#05503c',
                                }}
                              />
                              <button
                                onClick={handleAddTable}
                                disabled={tableActionLoading === -1}
                                style={{
                                  padding: '0.65rem 1.1rem', borderRadius: 12, border: 'none',
                                  background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                                  color: '#05503c', cursor: 'pointer',
                                  fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.82rem',
                                  boxShadow: '0 4px 16px rgba(253,202,0,0.3)',
                                  opacity: tableActionLoading === -1 ? 0.6 : 1,
                                }}
                              >
                                {tableActionLoading === -1 ? '…' : 'Add'}
                              </button>
                              <button
                                onClick={() => { setAddingTable(false); setNewTableNumber(''); }}
                                style={{
                                  width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(5,80,60,0.1)',
                                  background: 'rgba(5,80,60,0.05)', color: '#05503c', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <X size={15} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setAddingTable(true)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.65rem 1.25rem', borderRadius: 12, border: 'none',
                                background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                                color: '#05503c', cursor: 'pointer',
                                fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.82rem',
                                boxShadow: '0 4px 16px rgba(253,202,0,0.3)',
                                transition: 'transform 0.2s ease',
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
                            >
                              <Plus size={15} /> Add Table
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tables grid */}
                    {tables.length === 0 ? (
                      <div className="admin-empty-state">
                        <Coffee size={32} strokeWidth={1.25} style={{ color: 'rgba(5,80,60,0.2)', marginBottom: '0.75rem' }} />
                        <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.3)' }}>No tables found</p>
                      </div>
                    ) : (
                      <div className="admin-card-grid">
                        {tables.map(table => {
                          // Resilient check: consider table occupied if status says so OR if it has an active session_id
                          const occupied = table.table_status === 'occupied' || !!table.session_id;
                          const isExpanded = expandedTable === table.id;
                          const orders = sessionOrders[table.session_id] || [];
                          const subtotal = (orders.reduce((sum: number, o: any) => sum + (o.items?.reduce((os: number, i: any) => os + (i.quantity * i.unit_price), 0) || 0), 0)) || Number(table.subtotal) || 0;
                          const vat = subtotal * 0.15;
                          const service = subtotal * 0.10;
                          const total = subtotal + vat + service;
                          const pm = paymentMethod[table.session_id] || 'cash';

                          return (
                            <div key={table.id} className="af glass-card-admin" style={{
                              borderRadius: 24, overflow: 'hidden', position: 'relative',
                              border: occupied ? '1.5px solid rgba(253,202,0,0.3)' : '1px solid rgba(5,80,60,0.07)',
                              transition: 'box-shadow 0.2s ease',
                            }}>
                              {/* Status stripe */}
                              <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                background: occupied ? 'linear-gradient(90deg, #fdca00, #ffd845)' : 'rgba(34,197,94,0.5)',
                              }} />

                              {/* Table header */}
                              <div
                                onClick={() => occupied && handleExpandTable(table)}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  cursor: occupied ? 'pointer' : 'default',
                                  paddingBottom: occupied ? '1rem' : 0,
                                  borderBottom: occupied ? '1px solid rgba(5,80,60,0.06)' : 'none',
                                  marginBottom: occupied ? '1rem' : 0,
                                }}
                              >
                                <div>
                                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.04em', color: '#05503c', lineHeight: 1 }}>
                                    Table {table.table_number}
                                  </p>
                                  <p style={{ fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, marginTop: '0.3rem', color: occupied ? '#fdca00' : '#22c55e' }}>
                                    {occupied ? 'Occupied' : 'Available'}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                                  {occupied && (
                                    <>
                                      <span style={{
                                        fontSize: '0.68rem', fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                                        color: 'rgba(5,80,60,0.5)', letterSpacing: '0.05em',
                                      }}>
                                        {getSessionDuration(table.opened_at)}
                                      </span>
                                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        {Number(table.pending_count) > 0 && (
                                          <span style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: 6, background: 'rgba(253,202,0,0.15)', color: '#b8860b', fontWeight: 700 }}>
                                            {table.pending_count} pending
                                          </span>
                                        )}
                                        {Number(table.preparing_count) > 0 && (
                                          <span style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: 6, background: 'rgba(5,80,60,0.1)', color: '#05503c', fontWeight: 700 }}>
                                            {table.preparing_count} prep
                                          </span>
                                        )}
                                        {Number(table.ready_count) > 0 && (
                                          <span style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontWeight: 700 }}>
                                            {table.ready_count} ready
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Occupied: stats + expand */}
                              {occupied && (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <div>
                                      <p style={{ fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)' }}>Orders</p>
                                      <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.3rem', color: '#05503c' }}>{orders.length || table.order_count || 0}</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)' }}>Running Total</p>
                                      <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.3rem', color: '#05503c' }}>{total.toFixed(0)} ETB</p>
                                    </div>
                                  </div>

                                  {/* Expand/collapse orders */}
                                  <button
                                    onClick={() => handleExpandTable(table)}
                                    style={{
                                      width: '100%', padding: '0.6rem', borderRadius: 12,
                                      border: '1px solid rgba(5,80,60,0.1)',
                                      background: 'rgba(5,80,60,0.03)', color: '#05503c',
                                      cursor: 'pointer', fontFamily: 'var(--font-bricolage)',
                                      fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                      marginBottom: '0.75rem',
                                      transition: 'background 0.15s ease',
                                    }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.07)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.03)'}
                                  >
                                    {isExpanded ? 'Hide Orders' : 'View Orders'}
                                    <ArrowRight size={13} style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                  </button>

                                  {/* Expanded orders */}
                                  {isExpanded && (
                                    <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                      {orders.length === 0 ? (
                                        <p style={{ fontSize: '0.8rem', color: 'rgba(5,80,60,0.35)', textAlign: 'center', padding: '0.75rem' }}>Loading orders…</p>
                                      ) : orders.map((order: any) => (
                                        <div key={order.id} style={{
                                          padding: '0.75rem', borderRadius: 12,
                                          background: 'rgba(5,80,60,0.03)', border: '1px solid rgba(5,80,60,0.06)',
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.78rem', color: '#05503c' }}>
                                              Order #{order.id}
                                            </span>
                                            <span style={{
                                              fontSize: '0.6rem', padding: '0.2rem 0.55rem', borderRadius: 6, fontWeight: 700,
                                              background: order.status === 'ready' ? 'rgba(34,197,94,0.12)' : order.status === 'preparing' ? 'rgba(5,80,60,0.1)' : order.status === 'served' ? 'rgba(139,92,246,0.1)' : 'rgba(253,202,0,0.15)',
                                              color: order.status === 'ready' ? '#16a34a' : order.status === 'preparing' ? '#05503c' : order.status === 'served' ? '#7c3aed' : '#b8860b',
                                            }}>
                                              {order.status}
                                            </span>
                                          </div>
                                          {order.items && order.items.map((item: any, idx: number) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(5,80,60,0.6)', padding: '0.15rem 0' }}>
                                              <span>{item.quantity}× {item.name}</span>
                                              <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 600 }}>{(item.quantity * item.unit_price).toFixed(0)} ETB</span>
                                            </div>
                                          ))}
                                        </div>
                                      ))}

                                      {/* Bill breakdown */}
                                      {orders.length > 0 && (
                                        <div style={{ padding: '0.75rem 1rem', borderRadius: 12, background: 'rgba(253,202,0,0.06)', border: '1px solid rgba(253,202,0,0.2)', marginTop: '0.25rem' }}>
                                          {[
                                            { label: 'Subtotal', val: subtotal },
                                            { label: 'VAT (15%)', val: vat },
                                            { label: 'Service (10%)', val: service },
                                          ].map(row => (
                                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(5,80,60,0.6)', padding: '0.15rem 0' }}>
                                              <span>{row.label}</span>
                                              <span>{row.val.toFixed(0)} ETB</span>
                                            </div>
                                          ))}
                                          <div style={{ height: 1, background: 'rgba(5,80,60,0.1)', margin: '0.4rem 0' }} />
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.95rem', color: '#05503c' }}>
                                            <span>Total</span>
                                            <span>{total.toFixed(0)} ETB</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Payment method selector */}
                                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                                    {(['cash', 'card', 'mobile'] as const).map(m => (
                                      <button
                                        key={m}
                                        onClick={() => setPaymentMethod(prev => ({ ...prev, [table.session_id]: m }))}
                                        style={{
                                          flex: 1, padding: '0.5rem 0.25rem', borderRadius: 10, border: 'none',
                                          cursor: 'pointer', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.72rem',
                                          textTransform: 'capitalize',
                                          background: pm === m ? '#05503c' : 'rgba(5,80,60,0.06)',
                                          color: pm === m ? '#fff' : 'rgba(5,80,60,0.5)',
                                          transition: 'all 0.15s ease',
                                        }}
                                      >
                                        {m}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Action buttons */}
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                      onClick={() => handlePayment(table.session_id, pm)}
                                      className="shimmer-btn"
                                      style={{
                                        flex: 1, padding: '0.85rem', borderRadius: 14, border: 'none',
                                        background: 'linear-gradient(135deg, #fdca00 0%, #ffd845 100%)',
                                        color: '#05503c', cursor: 'pointer',
                                        fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem',
                                        boxShadow: '0 4px 18px rgba(253,202,0,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                      }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                                    >
                                      <DollarSign size={14} /> Settle Bill
                                    </button>
                                    <button
                                      onClick={() => handleDownloadQR(table.table_number, table.token)}
                                      title="Download QR code"
                                      style={{
                                        width: 44, height: 44, borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                                        background: 'rgba(5,80,60,0.05)', color: '#05503c',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'background 0.15s ease', flexShrink: 0,
                                      }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.1)'}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.05)'}
                                    >
                                      <Download size={15} />
                                    </button>
                                    {user?.role !== 'kitchen' && (
                                      <button
                                        onClick={() => handleCancelSession(table.session_id, table.table_number)}
                                        style={{
                                          width: 44, height: 44, borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)',
                                          background: 'rgba(239,68,68,0.05)', color: '#ef4444',
                                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          transition: 'background 0.15s ease', flexShrink: 0,
                                        }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'}
                                        title="Cancel session"
                                      >
                                        <X size={15} />
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}

                              {/* Available table */}
                              {!occupied && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Circle size={8} style={{ color: '#22c55e', fill: '#22c55e' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'rgba(5,80,60,0.4)' }}>Ready for guests</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button
                                      onClick={() => handleDownloadQR(table.table_number, table.token)}
                                      title="Download QR code"
                                      style={{
                                        width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(5,80,60,0.1)',
                                        background: 'rgba(5,80,60,0.05)', color: '#05503c', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'background 0.15s ease',
                                      }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.1)'}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.05)'}
                                    >
                                      <Download size={14} />
                                    </button>
                                    {(user?.role === 'super_admin' || user?.role === 'admin') && (
                                      <button
                                        onClick={() => handleDeleteTable(table.id, table.table_number, table.table_status)}
                                        disabled={tableActionLoading === table.id}
                                        title="Delete table"
                                        style={{
                                          width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)',
                                          background: 'rgba(239,68,68,0.05)', color: '#ef4444', cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          opacity: tableActionLoading === table.id ? 0.5 : 1,
                                          transition: 'background 0.15s ease',
                                        }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ════ MENU TOGGLES ══════════════════════════════ */}
                {activeTab === 'menu' && (
                  <div style={{ maxWidth: 900 }}>
                    {/* Header with Filter and Add Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.5)' }}>
                          {menuItems.filter(item => menuCategoryFilter === 'all' || item.category === menuCategoryFilter).length} items
                        </p>
                        <select
                          value={menuCategoryFilter}
                          onChange={e => setMenuCategoryFilter(e.target.value)}
                          style={{
                            padding: '0.6rem 1rem',
                            borderRadius: 10,
                            border: '1px solid rgba(5,80,60,0.1)',
                            background: 'rgba(255,255,255,0.75)',
                            fontFamily: 'var(--font-bricolage)',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            color: '#05503c',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="all">All Categories</option>
                          {MENU_CATEGORIES.map((cat: any) => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                          ))}
                        </select>
                      </div>
                      {user?.role !== 'kitchen' && (
                        <button
                          onClick={() => handleOpenMenuModal()}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.75rem 1.5rem', borderRadius: 12,
                            background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                            border: 'none', color: '#05503c', cursor: 'pointer',
                            fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem',
                            boxShadow: '0 4px 20px rgba(253,202,0,0.3)',
                            transition: 'transform 0.2s ease',
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
                        >
                          <Plus size={16} /> Add Menu Item
                        </button>
                      )}
                    </div>

                    {/* Menu Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {menuItems.filter(item => menuCategoryFilter === 'all' || item.category === menuCategoryFilter).map(item => (
                        <div
                          key={item.id}
                          className="af"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: '1rem', padding: '1rem 1.25rem',
                            background: 'rgba(255,255,255,0.75)',
                            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid rgba(5,80,60,0.07)',
                            borderRadius: 18,
                            boxShadow: '0 2px 12px rgba(5,80,60,0.04)',
                            opacity: item.is_available ? 1 : 0.55,
                            transition: 'opacity 0.2s ease, box-shadow 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                            <div style={{
                              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                              background: item.is_available ? 'rgba(5,80,60,0.06)' : 'rgba(239,68,68,0.07)',
                              border: `1px solid ${item.is_available ? 'rgba(5,80,60,0.1)' : 'rgba(239,68,68,0.12)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden'
                            }}>
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onLoad={(e) => {
                                    // Ensure fallback icon is hidden if image loads
                                    const next = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (next) next.style.display = 'none';
                                  }}
                                  onError={(e) => {
                                    console.error('Image load failed for:', item.name, item.image_url);
                                    e.currentTarget.style.display = 'none';
                                    const next = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (next) next.style.display = 'block';
                                  }}
                                />
                              ) : null}
                              <Coffee
                                size={17}
                                strokeWidth={1.5}
                                style={{
                                  color: item.is_available ? '#05503c' : '#ef4444',
                                  display: item.image_url ? 'none' : 'block'
                                }}
                              />
                            </div>
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                              <p style={{
                                fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.95rem',
                                color: '#05503c', letterSpacing: '-0.02em',
                                textDecoration: item.is_available ? 'none' : 'line-through',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                              }}>
                                {item.name}
                                {item.is_signature && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                    fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.05em',
                                    background: '#05503c', color: '#fdca00',
                                    padding: '0.15rem 0.4rem', borderRadius: '6px',
                                    textTransform: 'uppercase'
                                  }}>
                                    <TrendingUp size={10} strokeWidth={3} /> Signature
                                  </span>
                                )}
                              </p>
                              <p style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.15rem' }}>
                                {item.category} ·{
                                  quickPriceEdit[item.id] ? (
                                    <span
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.3rem' }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <input
                                        id={`quick-price-${item.id}`}
                                        type="number"
                                        min={1}
                                        step={0.5}
                                        value={quickPriceEdit[item.id].draft}
                                        autoFocus
                                        onChange={e => setQuickPriceEdit(prev => ({ ...prev, [item.id]: { ...prev[item.id], draft: e.target.value } }))}
                                        onKeyDown={async e => {
                                          if (e.key === 'Enter') {
                                            const newP = parseFloat(quickPriceEdit[item.id].draft);
                                            if (!isNaN(newP) && newP > 0) {
                                              setQuickPriceEdit(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: true } }));
                                              const token = await getFreshToken();
                                              const { error } = await actions.updateMenuItemPriceAction(item.id, newP, token);
                                              if (!error) {
                                                setMenuItems(items => items.map(i => i.id === item.id ? { ...i, price: newP } : i));
                                                setAdminToast({ message: `Price updated to ${newP} ETB`, type: 'success' });
                                              } else {
                                                setAdminToast({ message: 'Failed: ' + error, type: 'error' });
                                              }
                                              setQuickPriceEdit(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                            }
                                          }
                                          if (e.key === 'Escape') {
                                            setQuickPriceEdit(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                          }
                                        }}
                                        style={{
                                          width: 68, padding: '0.1rem 0.4rem', borderRadius: 6,
                                          border: '1.5px solid rgba(253,202,0,0.6)',
                                          fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.72rem',
                                          color: '#05503c', outline: 'none', background: 'rgba(253,202,0,0.08)',
                                          textTransform: 'none', letterSpacing: 0,
                                        }}
                                      />
                                      <button
                                        title="Save price"
                                        disabled={quickPriceEdit[item.id].saving}
                                        onClick={async e => {
                                          e.stopPropagation();
                                          const newP = parseFloat(quickPriceEdit[item.id].draft);
                                          if (!isNaN(newP) && newP > 0) {
                                            setQuickPriceEdit(prev => ({ ...prev, [item.id]: { ...prev[item.id], saving: true } }));
                                            const token = await getFreshToken();
                                            const { error } = await actions.updateMenuItemPriceAction(item.id, newP, token);
                                            if (!error) {
                                              setMenuItems(items => items.map(i => i.id === item.id ? { ...i, price: newP } : i));
                                              setAdminToast({ message: `Price updated to ${newP} ETB`, type: 'success' });
                                            } else {
                                              setAdminToast({ message: 'Failed: ' + error, type: 'error' });
                                            }
                                            setQuickPriceEdit(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                          }
                                        }}
                                        style={{
                                          width: 22, height: 22, borderRadius: 6, border: 'none',
                                          background: quickPriceEdit[item.id].saving ? 'rgba(5,80,60,0.3)' : '#05503c',
                                          color: '#fdca00', cursor: 'pointer',
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          flexShrink: 0,
                                        }}
                                      >
                                        {quickPriceEdit[item.id].saving ? <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={10} />}
                                      </button>
                                      <button
                                        title="Cancel"
                                        onClick={e => { e.stopPropagation(); setQuickPriceEdit(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}
                                        style={{
                                          width: 22, height: 22, borderRadius: 6, border: 'none',
                                          background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          flexShrink: 0,
                                        }}
                                      >
                                        <X size={10} />
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      id={`quick-price-trigger-${item.id}`}
                                      title="Tap to quickly edit price"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setQuickPriceEdit(prev => ({ ...prev, [item.id]: { draft: Number(item.price).toFixed(0), saving: false } }));
                                      }}
                                      style={{
                                        marginLeft: '0.3rem',
                                        padding: '0.1rem 0.4rem', borderRadius: 6,
                                        border: '1px dashed rgba(253,202,0,0.5)',
                                        background: 'rgba(253,202,0,0.06)', color: '#05503c',
                                        fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.72rem',
                                        cursor: 'pointer', textTransform: 'none', letterSpacing: 0,
                                        transition: 'background 0.15s',
                                      }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(253,202,0,0.18)'}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(253,202,0,0.06)'}
                                    >
                                      {Number(item.price).toFixed(0)} ETB ✎
                                    </button>
                                  )
                                }
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                            <button
                              onClick={() => handleToggleAvailability(item.id, item.is_available)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.4rem 0.8rem', borderRadius: '9999px', cursor: 'pointer',
                                fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.65rem',
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                                background: item.is_available ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: item.is_available ? '#22c55e' : '#ef4444',
                                border: `1px solid ${item.is_available ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                minWidth: '95px',
                                justifyContent: 'center'
                              }}
                            >
                              <div style={{
                                width: '12px', height: '12px', borderRadius: '50%',
                                background: item.is_available ? '#22c55e' : '#ef4444',
                                boxShadow: `0 0 8px ${item.is_available ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`
                              }} />
                              {item.is_available ? 'In Stock' : 'Sold Out'}
                            </button>

                            {user?.role !== 'kitchen' && (
                              <>
                                <button
                                  onClick={() => handleOpenMenuModal(item)}
                                  style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'rgba(5,80,60,0.06)', border: '1px solid rgba(5,80,60,0.1)',
                                    color: '#05503c', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.12)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.06)'}
                                >
                                  <Edit2 size={14} />
                                </button>

                                {(user?.role === 'super_admin' || user?.role === 'admin') && (
                                  <button
                                    onClick={() => { handleDeleteMenuItem(item.id); }}
                                    style={{
                                      width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      padding: '0', borderRadius: 10,
                                      background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)',
                                      color: '#ef4444', cursor: 'pointer', transition: 'all 0.2s ease',
                                      pointerEvents: 'auto', position: 'relative', zIndex: 10
                                    }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ════ BILLING VIEW ══════════════════════════════ */}
                {activeTab === 'billing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.4rem', color: '#05503c' }}>
                        Active Billing
                      </h2>
                      <div style={{ padding: '0.5rem 1rem', borderRadius: 12, background: 'rgba(253,202,0,0.1)', border: '1px solid rgba(253,202,0,0.2)', color: '#05503c', fontSize: '0.85rem', fontWeight: 700 }}>
                        {tables.filter(t => t.table_status === 'occupied' || !!t.session_id).length} Active Sessions
                      </div>
                    </div>

                    {/* Billing Stats */}
                    <div className="admin-stat-grid" style={{ marginBottom: '1rem' }}>
                      {[
                        {
                          label: 'Unpaid Revenue',
                          val: `${tables.reduce((sum, t) => {
                            const oList = sessionOrders[t.session_id] || [];
                            const sub = (oList.reduce((s, o) => s + (o.items?.reduce((os: number, i: any) => os + (i.quantity * i.unit_price), 0) || 0), 0)) || Number(t.subtotal) || 0;
                            return sum + (sub * 1.25);
                          }, 0).toLocaleString()} ETB`,
                          icon: DollarSign,
                          accent: '#fdca00'
                        },
                        { label: 'Active Sessions', val: tables.filter(t => t.table_status === 'occupied' || !!t.session_id).length, icon: Users, accent: '#05503c' },
                        { label: 'Pending Items', val: tables.reduce((sum, t) => sum + (Number(t.pending_count) || 0), 0), icon: ShoppingBag, accent: '#ef4444' },
                      ].map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                          <div key={i} className="af glass-card-admin" style={{ borderRadius: 22, position: 'relative', overflow: 'hidden', padding: '1rem' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stat.accent, borderRadius: '22px 22px 0 0' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: 10,
                                background: `${stat.accent}15`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Icon size={16} style={{ color: stat.accent }} />
                              </div>
                              <div>
                                <p style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)', marginBottom: '0.1rem' }}>{stat.label}</p>
                                <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem', color: '#05503c' }}>{stat.val}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {tables.filter(t => t.table_status === 'occupied' || !!t.session_id).length === 0 ? (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        padding: '6rem 2rem',
                        background: 'rgba(5,80,60,0.02)',
                        borderRadius: 24,
                        border: '1px dashed rgba(5,80,60,0.1)'
                      }}>
                        <DollarSign size={48} strokeWidth={1} style={{ color: 'rgba(5,80,60,0.15)', marginBottom: '1.5rem' }} />
                        <p style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.2rem', color: 'rgba(5,80,60,0.35)', fontWeight: 600 }}>No active sessions to bill</p>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.2)', marginTop: '0.5rem' }}>All tables are currently available</p>
                      </div>
                    ) : (
                      <div className="admin-card-grid">
                        {tables.filter(t => t.table_status === 'occupied' || !!t.session_id).map(table => {
                          const isExpanded = expandedTable === table.id;
                          const orders = sessionOrders[table.session_id] || [];
                          const subtotal = (orders.reduce((sum: number, o: any) => sum + (o.items?.reduce((os: number, i: any) => os + (i.quantity * i.unit_price), 0) || 0), 0)) || Number(table.subtotal) || 0;

                          // Official rates from Ethiopia (15% VAT, 10% Svc)
                          const vat = subtotal * 0.15;
                          const service = subtotal * 0.10;
                          const total = subtotal + vat + service;
                          const pm = paymentMethod[table.session_id] || 'cash';

                          return (
                            <div key={table.id} className="af glass-card-admin" style={{
                              borderRadius: 24, overflow: 'hidden', position: 'relative',
                              border: '1.5px solid rgba(253,202,0,0.4)',
                              boxShadow: '0 12px 40px rgba(5,80,60,0.08)',
                            }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #fdca00, #ffd845)' }} />

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div>
                                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '2.2rem', color: '#05503c', lineHeight: 1 }}>T{table.table_number}</p>
                                  <p style={{ fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)', marginTop: '0.4rem', fontWeight: 700 }}>
                                    Active for {getSessionDuration(table.opened_at)}
                                  </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.4)', marginBottom: '0.2rem' }}>Total Due</p>
                                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.8rem', color: '#fdca00', lineHeight: 1 }}>{total.toFixed(0)} <span style={{ fontSize: '0.9rem' }}>ETB</span></p>
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <button
                                  onClick={() => handleExpandTable(table)}
                                  style={{
                                    width: '100%', padding: '0.75rem', borderRadius: 12,
                                    border: '1px solid rgba(5,80,60,0.08)',
                                    background: 'rgba(5,80,60,0.03)', color: '#05503c',
                                    cursor: 'pointer', fontFamily: 'var(--font-bricolage)',
                                    fontWeight: 700, fontSize: '0.85rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                  }}
                                >
                                  {isExpanded ? 'Hide Items' : `View ${orders.length || table.order_count || 0} Orders`}
                                  <ArrowRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                </button>

                                {isExpanded && (
                                  <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0.5rem', background: 'rgba(5,80,60,0.02)', borderRadius: 12, border: '1px solid rgba(5,80,60,0.05)' }} className="scrollbar-hide">
                                    {orders.length === 0 ? (
                                      <p style={{ textAlign: 'center', padding: '1rem', color: 'rgba(5,80,60,0.3)', fontSize: '0.8rem' }}>Loading items...</p>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {orders.map((order: any) => (
                                          <div key={order.id} style={{ padding: '0.6rem', borderBottom: '1px solid rgba(5,80,60,0.05)' }}>
                                            {order.items.map((item: any, idx: number) => (
                                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                <span style={{ color: '#05503c' }}>{item.quantity}× {item.name}</span>
                                                <span style={{ fontWeight: 600 }}>{(item.quantity * item.unit_price).toFixed(0)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                        <div style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(5,80,60,0.5)' }}>
                                            <span>Subtotal</span>
                                            <span>{subtotal.toFixed(0)}</span>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(5,80,60,0.5)' }}>
                                            <span>VAT (15%) + Service (10%)</span>
                                            <span>{(vat + service).toFixed(0)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div style={{ marginBottom: '1.25rem' }}>
                                <p style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(5,80,60,0.4)', marginBottom: '0.6rem' }}>Select Payment Method</p>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  {(['cash', 'card', 'mobile'] as const).map(m => (
                                    <button
                                      key={m}
                                      onClick={() => setPaymentMethod(prev => ({ ...prev, [table.session_id]: m }))}
                                      style={{
                                        flex: 1, padding: '0.65rem 0.25rem', borderRadius: 12, border: 'none',
                                        cursor: 'pointer', fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.75rem',
                                        textTransform: 'capitalize',
                                        background: pm === m ? '#05503c' : 'rgba(5,80,60,0.05)',
                                        color: pm === m ? '#fff' : 'rgba(5,80,60,0.45)',
                                        transition: 'all 0.2s ease',
                                        boxShadow: pm === m ? '0 4px 12px rgba(5,80,60,0.2)' : 'none',
                                      }}
                                    >
                                      {m === 'mobile' ? 'Mobile' : m}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                  onClick={() => handlePayment(table.session_id, pm)}
                                  className="shimmer-btn"
                                  style={{
                                    flex: 1, padding: '1rem', borderRadius: 16, border: 'none',
                                    background: 'linear-gradient(135deg, #05503c 0%, #0a6b51 100%)',
                                    color: '#ffffff', cursor: 'pointer',
                                    fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.9rem',
                                    boxShadow: '0 8px 24px rgba(5,80,60,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                                  }}
                                >
                                  <DollarSign size={18} /> Confirm Payment
                                </button>
                                <button
                                  onClick={() => handleCancelSession(table.session_id, table.table_number)}
                                  title="Clear Table / Cancel Session"
                                  style={{
                                    width: 52, height: 52, borderRadius: 16, border: '1px solid rgba(239,68,68,0.2)',
                                    background: 'rgba(239,68,68,0.05)', color: '#ef4444',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'}
                                >
                                  <X size={20} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ════ PAYMENTS VIEW ══════════════════════════════ */}
                {activeTab === 'payments' && (
                  <PaymentAdmin />
                )}

                {/* ════ ADMIN MANAGEMENT ══════════════════════════ */}
                {activeTab === 'admins' && (user?.role === 'super_admin' || user?.role === 'admin') && (
                  <div style={{ maxWidth: 900 }}>
                    {/* Header with Add Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.5)' }}>
                        {adminUsers.length} admin users
                      </p>
                      <button
                        onClick={() => handleOpenAdminModal()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.75rem 1.5rem', borderRadius: 12,
                          background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                          border: 'none', color: '#05503c', cursor: 'pointer',
                          fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem',
                          boxShadow: '0 4px 20px rgba(253,202,0,0.3)',
                          transition: 'transform 0.2s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
                      >
                        <Plus size={16} /> Add Admin User
                      </button>
                    </div>

                    {/* Admin Users List */}
                    <div style={{
                      background: 'white',
                      borderRadius: 24,
                      border: '1px solid rgba(5,80,60,0.06)',
                      overflow: 'hidden',
                      boxShadow: '0 4px 20px rgba(5,80,60,0.02)'
                    }}>
                      {adminUsers.length === 0 ? (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                          <Users size={40} style={{ color: 'rgba(5,80,60,0.2)', marginBottom: '1.25rem' }} />
                          <p style={{ fontSize: '1rem', color: 'rgba(5,80,60,0.3)', fontWeight: 500 }}>No admin users found</p>
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: 'rgba(5,80,60,0.02)', borderBottom: '1px solid rgba(5,80,60,0.06)' }}>
                                <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.7rem', fontWeight: 800, color: 'rgba(5,80,60,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Admin User</th>
                                <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.7rem', fontWeight: 800, color: 'rgba(5,80,60,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email / Username</th>
                                <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.7rem', fontWeight: 800, color: 'rgba(5,80,60,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Role</th>
                                <th style={{ padding: '1.25rem 1.5rem', fontSize: '0.7rem', fontWeight: 800, color: 'rgba(5,80,60,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adminUsers.map(admin => {
                                const style = ROLE_STYLES[admin.role] || ROLE_STYLES.manager;
                                return (
                                  <tr key={admin.id} style={{ borderBottom: '1px solid rgba(5,80,60,0.04)', transition: 'background 0.2s ease' }} className="table-row-hover">
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{
                                          width: 38, height: 38, borderRadius: 10,
                                          background: style.bg,
                                          border: `1px solid ${style.border}`,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.9rem',
                                          color: style.text,
                                        }}>
                                          {(() => {
                                            const name = admin.full_name || admin.username || 'Admin';
                                            const words = name.trim().split(/\s+/);
                                            if (words.length > 1 && words[0][0] && words[1][0]) {
                                              return (words[0][0] + words[1][0]).toUpperCase();
                                            }
                                            return (name[0] || 'A').toUpperCase();
                                          })()}
                                        </div>
                                        <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.95rem', color: '#05503c' }}>
                                          {admin.full_name || 'Anonymous User'}
                                        </p>
                                      </div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(5,80,60,0.5)', fontSize: '0.85rem', fontWeight: 500 }}>
                                        <Mail size={14} style={{ opacity: 0.6 }} />
                                        {admin.username}
                                      </div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }} data-label="Role">
                                      <div style={{
                                        display: 'inline-block',
                                        padding: '0.3rem 0.7rem', borderRadius: 8,
                                        fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                                        background: style.bg,
                                        color: style.text,
                                        border: `1px solid ${style.border}`,
                                      }}>
                                        {style.label}
                                      </div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }} data-label="Actions">
                                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button
                                          onClick={() => handleOpenAdminModal(admin)}
                                          style={{
                                            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            borderRadius: 10, background: 'rgba(5,80,60,0.04)', border: '1px solid rgba(5,80,60,0.08)',
                                            color: '#05503c', cursor: 'pointer', transition: 'all 0.2s ease',
                                          }}
                                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.08)'}
                                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.04)'}
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                        {(user?.role === 'admin' || user?.role === 'super_admin') && (
                                          <button
                                            onClick={() => { handleDeleteAdmin(admin.id, admin.username); }}
                                            style={{
                                              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                              borderRadius: 10, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)',
                                              color: '#ef4444', cursor: 'pointer', transition: 'all 0.2s ease',
                                              pointerEvents: 'auto', position: 'relative', zIndex: 10
                                            }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'}
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'audit' && (user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'admin') && (() => {
                  // ── Derived filtered list ────────────────────────────
                  const ACTION_CATEGORIES: Record<string, string[]> = {
                    payments: ['CONFIRM_PAYMENT', 'APPROVE_PAYMENT', 'REJECT_PAYMENT'],
                    sessions: ['CANCEL_SESSION', 'BULK_CLOSE_SESSIONS'],
                    menu: ['CREATE_MENU_ITEM', 'UPDATE_MENU_ITEM', 'DELETE_MENU_ITEM', 'ENABLE_MENU_ITEM', 'DISABLE_MENU_ITEM', 'UPDATE_ITEM_PRICE'],
                    admin: ['CREATE_ADMIN_USER', 'UPDATE_ADMIN_USER', 'DELETE_ADMIN_USER'],
                    tables: ['CREATE_TABLE', 'DELETE_TABLE'],
                    system: ['RESET_DASHBOARD'],
                  };
                  const filteredLogs = auditLogs.filter((log: any) => {
                    const matchesSearch = auditSearch === '' ||
                      (log.admin_users?.full_name || log.admin_users?.username || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
                      log.action_type.toLowerCase().includes(auditSearch.toLowerCase()) ||
                      (log.reason || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
                      (log.entity_type || '').toLowerCase().includes(auditSearch.toLowerCase());
                    const matchesFilter = auditActionFilter === 'all' || (ACTION_CATEGORIES[auditActionFilter] || []).includes(log.action_type);
                    return matchesSearch && matchesFilter;
                  });

                  const getActionStyle = (actionType: string) => {
                    if (['CANCEL_SESSION','REJECT_PAYMENT','DELETE_MENU_ITEM','DELETE_ADMIN_USER','DELETE_TABLE','RESET_DASHBOARD','BULK_CLOSE_SESSIONS'].includes(actionType))
                      return { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' };
                    if (['CONFIRM_PAYMENT','APPROVE_PAYMENT'].includes(actionType))
                      return { bg: 'rgba(34,197,94,0.12)', color: '#16a34a' };
                    if (['UPDATE_ITEM_PRICE','UPDATE_MENU_ITEM','UPDATE_ADMIN_USER'].includes(actionType))
                      return { bg: 'rgba(253,202,0,0.15)', color: '#92700a' };
                    return { bg: 'rgba(5,80,60,0.08)', color: '#05503c' };
                  };

                  return (
                  <div className="af" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.8rem', letterSpacing: '-0.03em', color: '#05503c', marginBottom: '0.4rem' }}>
                          Audit &amp; Reconciliation
                        </h2>
                        <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.95rem', color: 'rgba(5,80,60,0.6)' }}>
                          Complete history of sensitive administrative actions — live updated.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-bricolage)', fontWeight: 600, color: 'rgba(5,80,60,0.45)' }}>
                          {filteredLogs.length} / {auditLogs.length} entries
                        </span>
                        <button
                          onClick={loadAuditLogs}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.65rem 1.1rem', borderRadius: 12,
                            background: '#ffffff', border: '1px solid rgba(5,80,60,0.1)',
                            color: '#05503c', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.82rem',
                            cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(5,80,60,0.04)'
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.04)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff'; }}
                        >
                          <RefreshCw size={14} /> Refresh
                        </button>
                      </div>
                    </div>

                    {/* Search + Filter bar */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                        <input
                          type="text"
                          placeholder="Search admin, action, reason…"
                          value={auditSearch}
                          onChange={e => setAuditSearch(e.target.value)}
                          style={{
                            width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem',
                            borderRadius: 14, border: '1px solid rgba(5,80,60,0.12)',
                            background: '#ffffff', fontSize: '0.9rem',
                            fontFamily: 'var(--font-instrument)', color: '#05503c',
                            outline: 'none', boxSizing: 'border-box',
                            boxShadow: '0 2px 8px rgba(5,80,60,0.04)'
                          }}
                        />
                        <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(5,80,60,0.35)', pointerEvents: 'none', fontSize: '1rem' }}>🔍</span>
                      </div>
                      <select
                        value={auditActionFilter}
                        onChange={e => setAuditActionFilter(e.target.value)}
                        style={{
                          padding: '0.75rem 1rem', borderRadius: 14,
                          border: '1px solid rgba(5,80,60,0.12)', background: '#ffffff',
                          fontSize: '0.87rem', fontFamily: 'var(--font-bricolage)', fontWeight: 600,
                          color: '#05503c', cursor: 'pointer', outline: 'none',
                          boxShadow: '0 2px 8px rgba(5,80,60,0.04)'
                        }}
                      >
                        <option value="all">All Categories</option>
                        <option value="payments">💳 Payments</option>
                        <option value="sessions">🪑 Sessions</option>
                        <option value="menu">🍽 Menu</option>
                        <option value="admin">👤 Admin Users</option>
                        <option value="tables">🗂 Tables</option>
                        <option value="system">⚙️ System</option>
                      </select>
                    </div>

                    {/* Log table */}
                    <div style={{ background: '#ffffff', borderRadius: 24, border: '1px solid rgba(5,80,60,0.08)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(5,80,60,0.04)' }}>
                      {filteredLogs.length === 0 ? (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(5,80,60,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <FileText size={24} style={{ color: 'rgba(5,80,60,0.3)' }} />
                          </div>
                          <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1.1rem', color: '#05503c', marginBottom: '0.25rem' }}>
                            {auditLogs.length === 0 ? 'No Audit Logs Found' : 'No Results Match Your Filter'}
                          </p>
                          <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.5)' }}>
                            {auditLogs.length === 0 ? 'System actions will appear here once performed.' : 'Try adjusting your search or category filter.'}
                          </p>
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: 'rgba(5,80,60,0.02)', borderBottom: '1px solid rgba(5,80,60,0.08)' }}>
                                {['Timestamp','Admin','Action','Entity','Details'].map(h => (
                                  <th key={h} style={{ padding: '1.1rem 1.25rem', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.45)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredLogs.map((log: any) => {
                                const style = getActionStyle(log.action_type);
                                const isExpanded = auditExpandedRow === log.id;
                                // Build a readable snapshot summary
                                const snap = log.snapshot || {};
                                const snapLines = Object.entries(snap).map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`);
                                return (
                                  <>
                                    <tr
                                      key={log.id}
                                      onClick={() => setAuditExpandedRow(isExpanded ? null : log.id)}
                                      style={{
                                        borderBottom: isExpanded ? 'none' : '1px solid rgba(5,80,60,0.05)',
                                        cursor: 'pointer',
                                        background: isExpanded ? 'rgba(5,80,60,0.015)' : 'transparent',
                                        transition: 'background 0.15s'
                                      }}
                                      onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.02)'; }}
                                      onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                      <td style={{ padding: '1rem 1.25rem', fontSize: '0.82rem', color: 'rgba(5,80,60,0.6)', whiteSpace: 'nowrap' }}>
                                        {new Date(log.created_at).toLocaleString()}
                                      </td>
                                      <td style={{ padding: '1rem 1.25rem', fontFamily: 'var(--font-bricolage)', fontWeight: 600, fontSize: '0.88rem', color: '#05503c', whiteSpace: 'nowrap' }}>
                                        {log.admin_users?.full_name || log.admin_users?.username || 'Unknown'}
                                      </td>
                                      <td style={{ padding: '1rem 1.25rem' }}>
                                        <span style={{
                                          display: 'inline-block', padding: '0.3rem 0.65rem', borderRadius: 8,
                                          background: style.bg, color: style.color,
                                          fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.04em',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {log.action_type}
                                        </span>
                                      </td>
                                      <td style={{ padding: '1rem 1.25rem', fontSize: '0.83rem', color: 'rgba(5,80,60,0.65)', whiteSpace: 'nowrap' }}>
                                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.entity_type}</span> #{log.entity_id}
                                      </td>
                                      <td style={{ padding: '1rem 1.25rem', fontSize: '0.83rem', color: 'rgba(5,80,60,0.65)', maxWidth: 280 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                            {log.reason || snapLines[0] || '—'}
                                          </span>
                                          {(snapLines.length > 0 || log.reason) && (
                                            <span style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.35)', flexShrink: 0 }}>
                                              {isExpanded ? '▲' : '▼'}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr key={`${log.id}-detail`} style={{ borderBottom: '1px solid rgba(5,80,60,0.05)', background: 'rgba(5,80,60,0.015)' }}>
                                        <td colSpan={5} style={{ padding: '0 1.25rem 1.25rem 1.25rem' }}>
                                          <div style={{
                                            background: 'rgba(5,80,60,0.04)', borderRadius: 12,
                                            padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                                          }}>
                                            {log.reason && (
                                              <div style={{ fontSize: '0.83rem', color: '#05503c' }}>
                                                <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700 }}>Reason: </span>{log.reason}
                                              </div>
                                            )}
                                            {snapLines.length > 0 && (
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: log.reason ? '0.25rem' : 0 }}>
                                                {snapLines.map((line, i) => (
                                                  <span key={i} style={{
                                                    padding: '0.25rem 0.65rem', borderRadius: 8,
                                                    background: '#ffffff', border: '1px solid rgba(5,80,60,0.1)',
                                                    fontSize: '0.78rem', color: 'rgba(5,80,60,0.75)',
                                                    fontFamily: 'var(--font-instrument)'
                                                  }}>{line}</span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>

            )}
          </div>
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ──────────────────────────────────── */}
      <nav className="admin-bottom-nav">
        {NAV_ITEMS.filter(item => !user?.role || item.roles.includes(user.role as any)).map(({ id, label, short, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                padding: '0.6rem 0.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
                color: active ? '#05503c' : 'rgba(5,80,60,0.35)',
                transition: 'color 0.2s ease',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'linear-gradient(135deg, #fdca00, #ffd845)' : 'transparent',
                boxShadow: active ? '0 4px 16px rgba(253,202,0,0.35)' : 'none',
                transition: 'all 0.2s ease',
              }}>
                <Icon size={17} strokeWidth={active ? 2.5 : 1.75} style={{ color: active ? '#05503c' : 'rgba(5,80,60,0.45)' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.04em' }}>
                {short}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── MENU CMS MODAL ─────────────────────────────────────── */}
      {showMenuModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(5,80,60,0.2)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}
          onClick={handleCloseMenuModal}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              maxWidth: 600, width: '100%',
              maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(5,80,60,0.2)',
            }}
            className="admin-modal-container"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem 2rem',
              borderBottom: '1px solid rgba(5,80,60,0.07)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{
                fontFamily: 'var(--font-bricolage)', fontWeight: 800,
                fontSize: '1.5rem', letterSpacing: '-0.03em', color: '#05503c',
              }}>
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </h2>
              <button
                onClick={handleCloseMenuModal}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(5,80,60,0.06)', border: 'none',
                  color: '#05503c', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Name */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={menuForm.name}
                  onChange={e => setMenuForm({ ...menuForm, name: e.target.value })}
                  placeholder="e.g., Doro Wat"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Category */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Category *
                </label>
                <select
                  value={menuForm.category}
                  onChange={e => setMenuForm({ ...menuForm, category: e.target.value })}
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  {MENU_CATEGORIES.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Description *
                </label>
                <textarea
                  value={menuForm.description}
                  onChange={e => setMenuForm({ ...menuForm, description: e.target.value })}
                  placeholder="Describe the dish..."
                  rows={3}
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none', resize: 'vertical',
                  }}
                />
              </div>

              {/* Price */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Price (ETB) *
                </label>
                <input
                  type="number"
                  value={menuForm.price}
                  onChange={e => setMenuForm({ ...menuForm, price: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Stock Quantity */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Stock Quantity *
                </label>
                <input
                  type="number"
                  value={menuForm.stock_quantity}
                  onChange={e => setMenuForm({ ...menuForm, stock_quantity: e.target.value })}
                  placeholder="999"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Ingredients */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Ingredients (comma-separated)
                </label>
                <input
                  type="text"
                  value={menuForm.ingredients}
                  onChange={e => setMenuForm({ ...menuForm, ingredients: e.target.value })}
                  placeholder="e.g., Chicken, Berbere, Eggs, Injera"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Image Upload */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Dish Image
                </label>

                {imagePreview ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(5,80,60,0.1)' }}>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      style={{
                        width: '100%', height: 220, objectFit: 'cover',
                        display: 'block'
                      }}
                      onError={(e) => {
                        console.error('Image preview failed to load:', imagePreview);
                        setImagePreview(null);
                      }}
                    />
                    <div style={{
                      position: 'absolute', inset: 0, background: 'rgba(5,80,60,0.3)',
                      opacity: 0, transition: 'opacity 0.2s ease',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem'
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                    >
                      <label style={{
                        padding: '0.6rem 1.2rem', borderRadius: 10,
                        background: '#fff', color: '#05503c',
                        fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.75rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                      }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                          style={{ display: 'none' }}
                        />
                        <Upload size={14} /> Change Image
                      </label>
                      <button
                        onClick={handleRemoveImage}
                        type="button"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: 'rgba(239,68,68,0.9)', border: 'none',
                          color: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        title="Remove Image"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: 200, borderRadius: 12, border: '2px dashed rgba(5,80,60,0.2)',
                    background: 'rgba(5,80,60,0.02)', cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(253,202,0,0.5)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(253,202,0,0.05)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(5,80,60,0.2)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(5,80,60,0.02)';
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      style={{ display: 'none' }}
                    />
                    {uploadingImage ? (
                      <>
                        <RefreshCw size={32} style={{ color: '#fdca00', marginBottom: 8, animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '0.85rem', color: 'rgba(5,80,60,0.5)' }}>Uploading...</p>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={32} style={{ color: 'rgba(5,80,60,0.3)', marginBottom: 8 }} />
                        <p style={{ fontSize: '0.85rem', color: 'rgba(5,80,60,0.5)', marginBottom: 4 }}>
                          Click to upload image
                        </p>
                        <p style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.3)' }}>
                          PNG, JPG, WebP or GIF (max 5MB)
                        </p>
                      </>
                    )}
                  </label>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Available Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    onClick={() => setMenuForm({ ...menuForm, is_available: !menuForm.is_available })}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: menuForm.is_available ? '#fdca00' : 'rgba(5,80,60,0.1)',
                      position: 'relative', cursor: 'pointer', transition: 'all 0.3s ease',
                      border: '1px solid rgba(5,80,60,0.05)'
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, left: menuForm.is_available ? 22 : 2,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }} />
                  </div>
                  <label
                    style={{
                      fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                      fontSize: '0.85rem', color: '#05503c', cursor: 'pointer',
                    }}
                  >
                    In Stock / Available
                  </label>
                </div>

                {/* Signature Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    onClick={() => setMenuForm({ ...menuForm, is_signature: !menuForm.is_signature })}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: menuForm.is_signature ? '#05503c' : 'rgba(5,80,60,0.1)',
                      position: 'relative', cursor: 'pointer', transition: 'all 0.3s ease',
                      border: '1px solid rgba(5,80,60,0.05)'
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, left: menuForm.is_signature ? 22 : 2,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }} />
                  </div>
                  <label
                    style={{
                      fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                      fontSize: '0.85rem', color: '#05503c', cursor: 'pointer',
                    }}
                  >
                    Signature Dish
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1.5rem 2rem',
              borderTop: '1px solid rgba(5,80,60,0.07)',
              display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
            }}>
              <button
                onClick={handleCloseMenuModal}
                style={{
                  padding: '0.75rem 1.5rem', borderRadius: 12,
                  background: 'rgba(5,80,60,0.06)', border: '1px solid rgba(5,80,60,0.1)',
                  color: '#05503c', cursor: 'pointer',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMenuItem}
                style={{
                  padding: '0.75rem 1.5rem', borderRadius: 12,
                  background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                  border: 'none', color: '#05503c', cursor: 'pointer',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem',
                  boxShadow: '0 4px 20px rgba(253,202,0,0.3)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}
              >
                <Save size={16} /> {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN MANAGEMENT MODAL ─────────────────────────────── */}
      {showAdminModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(5,80,60,0.2)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}
          onClick={handleCloseAdminModal}
        >
          <div
            style={{
              background: '#ffffff', borderRadius: '24px',
              maxWidth: 500, width: '100%',
              maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(5,80,60,0.2)',
            }}
            className="admin-modal-container"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem 2rem',
              borderBottom: '1px solid rgba(5,80,60,0.07)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{
                fontFamily: 'var(--font-bricolage)', fontWeight: 800,
                fontSize: '1.5rem', letterSpacing: '-0.03em', color: '#05503c',
              }}>
                {editingAdmin ? 'Edit Admin User' : 'Add Admin User'}
              </h2>
              <button
                onClick={handleCloseAdminModal}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(5,80,60,0.06)', border: 'none',
                  color: '#05503c', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Full Name */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={adminForm.full_name}
                  onChange={e => setAdminForm({ ...adminForm, full_name: e.target.value })}
                  placeholder="e.g., John Doe"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none', background: '#fff',
                  }}
                />
                <p style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.4)', marginTop: '0.3rem' }}>
                  Used as display name throughout the app
                </p>
              </div>

              {/* Username */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Username *
                </label>
                <input
                  type="text"
                  value={adminForm.username}
                  onChange={e => setAdminForm({ ...adminForm, username: e.target.value })}
                  placeholder="e.g., john_doe"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none',
                    background: '#fff',
                    cursor: 'text',
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Password {!editingAdmin && '*'}
                </label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                  placeholder={editingAdmin ? 'Leave blank to keep current password' : 'Enter password'}
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none',
                  }}
                />
                {editingAdmin && (
                  <p style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.4)', marginTop: '0.3rem' }}>
                    Only fill this if you want to change the password
                  </p>
                )}
              </div>

              {/* Role */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.5rem',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                  fontSize: '0.85rem', color: '#05503c',
                }}>
                  Role *
                </label>
                <select
                  value={adminForm.role}
                  onChange={e => setAdminForm({ ...adminForm, role: e.target.value })}
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 12, border: '1px solid rgba(5,80,60,0.1)',
                    fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="kitchen">Kitchen</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Super Admin</option>
                </select>
                <p style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.4)', marginTop: '0.3rem' }}>
                  {adminForm.role === 'admin' && 'Full access including admin management'}
                  {adminForm.role === 'manager' && 'Access to dashboard, kitchen, tables, menu, and reports'}
                  {adminForm.role === 'kitchen' && 'Access to kitchen board only'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1.5rem 2rem',
              borderTop: '1px solid rgba(5,80,60,0.07)',
              display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
            }}>
              <button
                onClick={handleCloseAdminModal}
                style={{
                  padding: '0.75rem 1.5rem', borderRadius: 12,
                  background: 'rgba(5,80,60,0.06)', border: '1px solid rgba(5,80,60,0.1)',
                  color: '#05503c', cursor: 'pointer',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAdmin}
                disabled={adminSaving}
                style={{
                  padding: '0.75rem 1.5rem', borderRadius: 12,
                  background: 'linear-gradient(135deg, #fdca00, #ffd845)',
                  border: 'none', color: '#05503c', cursor: adminSaving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.85rem',
                  boxShadow: '0 4px 20px rgba(253,202,0,0.3)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  opacity: adminSaving ? 0.7 : 1,
                }}
              >
                {adminSaving ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {adminSaving ? 'Saving…' : (editingAdmin ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SPIN KEYFRAME (inline) ─ matches globals.css pattern ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── SIDEBAR ── */
        .admin-sidebar {
          width: 280px;
          height: 100svh;
          position: fixed;
          top: 0; left: -280px;
          z-index: 40;
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border-right: 1px solid rgba(5,80,60,0.08);
          box-shadow: 12px 0 40px rgba(5,80,60,0.08);
          display: flex; flex-direction: column;
          transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          padding-top: 0; /* Removed excessive padding */
        }
        .admin-sidebar--open { left: 0; }

        /* ── DESKTOP: sidebar always visible ── */
        @media (min-width: 1024px) {
          .admin-topbar { display: none !important; }
          .admin-sidebar {
            position: sticky;
            top: 0;
            left: 0;
            height: 100svh;
            padding-top: 0;
          }
          .lg-hide-btn { display: none !important; }
          .admin-main  { padding-top: 0 !important; padding-bottom: 2.5rem !important; }
          .admin-bottom-nav { display: none !important; }
          .admin-page-header { padding-top: 2.5rem !important; }
        }

        /* ── GLASS CARD ── */
        .glass-card-admin {
          background: rgba(255,255,255,0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(5,80,60,0.07);
          box-shadow: 0 4px 24px rgba(5,80,60,0.06);
          padding: 1.4rem;
        }

        /* ── GRIDS ── */
        .admin-kitchen-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
        }
        .admin-card-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .admin-stat-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }
        @media (min-width: 640px) {
          .admin-kitchen-grid { grid-template-columns: repeat(2, 1fr); }
          .admin-card-grid    { grid-template-columns: repeat(2, 1fr); }
          .admin-stat-grid    { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .admin-kitchen-grid { grid-template-columns: repeat(3, 1fr); }
          .admin-card-grid    { grid-template-columns: repeat(3, 1fr); }
          .admin-stat-grid    { grid-template-columns: repeat(4, 1fr); }
        }

        /* ── EMPTY STATE ── */
        .admin-empty-state {
          grid-column: 1 / -1;
          min-height: 200px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border: 1.5px dashed rgba(5,80,60,0.1);
          border-radius: 24px;
        }

        /* ── BOTTOM NAV ── */}
        .admin-bottom-nav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 50;
          display: flex;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-top: 1px solid rgba(5,80,60,0.07);
          padding: 0.35rem 0.5rem calc(0.35rem + env(safe-area-inset-bottom));
        }
        
        /* ── DASHBOARD TWO COL ── */
        .dashboard-two-col {
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .dashboard-two-col {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
      {/* Admin Toast Notification System */}
      {adminToast && (
        <div 
          style={{
            position: 'fixed', bottom: '5.5rem', left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, padding: '1rem 1.5rem', borderRadius: '1.25rem',
            background: adminToast.type === 'error' ? '#ef4444' : adminToast.type === 'success' ? '#05503c' : '#ffffff',
            color: adminToast.type === 'info' ? '#05503c' : '#ffffff',
            boxShadow: '0 15px 50px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.9rem',
            minWidth: '280px', pointerEvents: 'auto',
            border: adminToast.type === 'info' ? '1px solid rgba(5,80,60,0.1)' : 'none'
          }}
          onClick={() => setAdminToast(null)}
        >
          {adminToast.type === 'error' ? <XCircle size={20} /> : adminToast.type === 'success' ? <CheckCircle size={20} /> : <div style={{ color: '#fdca00' }}><CheckCircle size={20} /></div>}
          {adminToast.message}
          <style>{`
            @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
          `}</style>
          {/* Auto-dismiss after 4s */}
          {setTimeout(() => setAdminToast(null), 4000) && null}
        </div>
      )}
    </div>
  );
}
