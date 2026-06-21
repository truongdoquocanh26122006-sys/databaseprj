import { useEffect, useMemo, useState } from 'react';
import {
  Armchair,
  BarChart3,
  Boxes,
  CalendarDays,
  CreditCard,
  Gift,
  LayoutDashboard,
  PackagePlus,
  PackageCheck,
  RefreshCw,
  Trophy,
  Users
} from 'lucide-react';
import { api, post, setAuthToken } from './api';

type AnyRow = Record<string, any>;
type AuthUser = AnyRow & { id: number; username: string; role: 'staff' | 'customer'; makh?: string; manv?: string };
type SubmitFn = (label: string, fn: () => Promise<unknown>) => Promise<unknown | null>;

const tabs = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: CreditCard },
  { id: 'rooms', label: 'Phòng/Ghế', icon: Armchair },
  { id: 'inventory', label: 'Kho', icon: Boxes },
  { id: 'create-item', label: 'Tạo vật phẩm', icon: PackagePlus },
  { id: 'packages', label: 'Gói', icon: PackageCheck },
  { id: 'rank-gifts', label: 'Quà rank', icon: Gift },
  { id: 'staff', label: 'Ca làm', icon: Users },
  { id: 'reports', label: 'Báo cáo', icon: BarChart3 }
];
const customerTabs = [
  { id: 'customer-home', label: 'Tài khoản', icon: Users }
];

const money = (value: unknown) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));

const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(String(value)).toLocaleDateString('en-CA');
};
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('vi-VN') : '';
const duration = (value: unknown) => {
  if (!value || typeof value !== 'object') return String(value || '');
  const parts = value as AnyRow;
  return [
    parts.days ? `${parts.days} ngày` : '',
    parts.hours ? `${parts.hours} giờ` : '',
    parts.minutes ? `${parts.minutes} phút` : ''
  ].filter(Boolean).join(' ') || '0 phút';
};
const localDateTimeInput = (offsetMinutes = 60) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const packageDurationDays = (madv: string) => madv === 'DV04' ? 7 : 1;
const packageDurationLabel = (madv: string) => `${packageDurationDays(madv)} ngày`;
const paramsToQuery = (params: Record<string, string>) => new URLSearchParams(params).toString();

function Table({ rows, columns }: { rows: AnyRow[]; columns: { key: string; label: string; render?: (row: AnyRow) => string }[] }) {
  if (!rows?.length) return <div className="empty">Không có dữ liệu</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Notice({ kind, text, onClose }: { kind: 'success' | 'error'; text: string; onClose: () => void }) {
  return (
    <div className={`notice ${kind}`}>
      <span>{text}</span>
      <button className="notice-close" onClick={onClose} title="Đóng thông báo">Đóng</button>
    </div>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [authReady, setAuthReady] = useState(false);
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [lookups, setLookups] = useState<AnyRow>({});
  const [data, setData] = useState<AnyRow>({});
  const [customerData, setCustomerData] = useState<AnyRow>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const activeTabs = auth?.role === 'staff' ? tabs : customerTabs;

  const load = async () => {
    if (!auth || auth.role !== 'staff') return;
    setLoading(true);
    setError('');
    try {
      const [lookupsData, dashboard, orders, rooms, inventory, packagesData, rankGifts, staff] = await Promise.all([
        api<AnyRow>('/dashboard/lookups'),
        api<AnyRow>('/dashboard'),
        api<AnyRow[]>('/orders'),
        api<AnyRow>('/rooms'),
        api<AnyRow>('/inventory'),
        api<AnyRow[]>('/packages'),
        api<AnyRow>('/rank-gifts'),
        api<AnyRow>('/staff')
      ]);
      setLookups(lookupsData);
      setData({ dashboard, orders, rooms, inventory, packages: packagesData, rankGifts, staff });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomer = async () => {
    if (!auth || auth.role !== 'customer') return;
    setLoading(true);
    setError('');
    try {
      setCustomerData(await api<AnyRow>('/customer/me'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reload = () => {
    if (auth?.role === 'staff') {
      void load();
    } else {
      void loadCustomer();
    }
  };

  useEffect(() => {
    const restore = async () => {
      const token = window.localStorage.getItem('studyspace_token') || '';
      if (!token) {
        setAuthReady(true);
        return;
      }
      setAuthToken(token);
      try {
        setAuth(await api<AuthUser>('/auth/me'));
      } catch {
        setAuthToken('');
      } finally {
        setAuthReady(true);
      }
    };
    void restore();
  }, []);

  useEffect(() => {
    if (!auth) return;
    setActiveTab(auth.role === 'staff' ? 'overview' : 'customer-home');
    if (auth.role === 'staff') {
      void load();
    } else {
      void loadCustomer();
    }
  }, [auth?.id]);

  useEffect(() => {
    if (!message && !error) return;
    const timeout = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [message, error]);

  const switchTab = (tabId: string) => {
    setActiveTab(tabId);
    setMessage('');
    setError('');
  };

  const login = async (payload: Record<string, unknown>) => {
    setError('');
    const result = await post<{ token: string; user: AuthUser }>('/auth/login', payload);
    setAuthToken(result.token);
    setAuth(result.user);
  };

  const register = async (payload: Record<string, unknown>) => {
    setError('');
    const result = await post<{ token: string; user: AuthUser }>('/auth/register', payload);
    setAuthToken(result.token);
    setAuth(result.user);
  };

  const logout = () => {
    setAuthToken('');
    setAuth(null);
    setData({});
    setCustomerData({});
    setLookups({});
    setMessage('');
    setError('');
  };

  const submit = async (label: string, fn: () => Promise<unknown>) => {
    setMessage('');
    setError('');
    try {
      const result = await fn();
      const text = typeof result === 'object' && result
        ? ((result as AnyRow).message || (result as AnyRow).receipt || `${label} thành công`)
        : `${label} thành công`;
      setMessage(String(text));
      if (auth?.role === 'staff') {
        await load();
      } else {
        await loadCustomer();
      }
      if (label === 'Thanh toán' && String(text).includes('RANK UP')) {
        setActiveTab('rank-gifts');
      }
      return result || true;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  };

  if (!authReady) {
    return <div className="auth-page"><div className="empty">Đang kiểm tra phiên đăng nhập...</div></div>;
  }

  if (!auth) {
    return <AuthScreen onLogin={login} onRegister={register} error={error} setError={setError} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SS</div>
          <div>
            <strong>StudySpace</strong>
            <span>{auth.role === 'staff' ? 'Database Admin' : 'Khách hàng'}</span>
          </div>
        </div>
        <nav>
          {activeTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => switchTab(tab.id)}>
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <span>{auth.username}</span>
          <button className="secondary" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{activeTabs.find((tab) => tab.id === activeTab)?.label}</h1>
            <p>{auth.role === 'staff' ? 'Dashboard demo kết nối PostgreSQL `namt_studyspace`' : 'Trang người dùng giới hạn theo tài khoản khách hàng'}</p>
          </div>
          <button className="icon-button" onClick={reload} disabled={loading} title="Tải lại dữ liệu">
            <RefreshCw size={18} />
            Tải lại
          </button>
        </header>

        {message && <Notice kind="success" text={message} onClose={() => setMessage('')} />}
        {error && <Notice kind="error" text={error} onClose={() => setError('')} />}

        {activeTab === 'customer-home' && <CustomerHome data={customerData} submit={submit} />}
        {activeTab === 'overview' && <Overview data={data.dashboard} />}
        {activeTab === 'orders' && <Orders data={data.orders || []} lookups={lookups} submit={submit} />}
        {activeTab === 'rooms' && <Rooms data={data.rooms} />}
        {activeTab === 'inventory' && <Inventory data={data.inventory} submit={submit} />}
        {activeTab === 'create-item' && <CreateItem data={data.inventory} submit={submit} />}
        {activeTab === 'packages' && <Packages rows={data.packages || []} lookups={lookups} submit={submit} />}
        {activeTab === 'rank-gifts' && <RankGifts data={data.rankGifts} lookups={lookups} submit={submit} />}
        {activeTab === 'staff' && <Staff data={data.staff} submit={submit} />}
        {activeTab === 'reports' && <Reports />}
      </main>
    </div>
  );
}

function AuthScreen({
  onLogin,
  onRegister,
  error,
  setError
}: {
  onLogin: (payload: Record<string, unknown>) => Promise<void>;
  onRegister: (payload: Record<string, unknown>) => Promise<void>;
  error: string;
  setError: (value: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: 'admin', password: 'admin123', hoten: '', sdt: '' });
  const [loading, setLoading] = useState(false);
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await onLogin({ username: form.username, password: form.password });
      } else {
        await onRegister(form);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">SS</div>
          <div>
            <strong>StudySpace</strong>
            <span>{mode === 'login' ? 'Đăng nhập hệ thống' : 'Tạo tài khoản khách hàng'}</span>
          </div>
        </div>
        {error && <Notice kind="error" text={error} onClose={() => setError('')} />}
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Đăng nhập</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Tạo tài khoản</button>
        </div>
        <div className="form-grid one">
          <Field label="Username" value={form.username} onChange={(v) => set('username', v)} />
          <Field label="Mật khẩu" value={form.password} onChange={(v) => set('password', v)} type="password" />
          {mode === 'register' && (
            <>
              <Field label="Họ tên" value={form.hoten} onChange={(v) => set('hoten', v)} />
              <Field label="SĐT" value={form.sdt} onChange={(v) => set('sdt', v)} placeholder="09xxxxxxxx" />
            </>
          )}
        </div>
        <button onClick={submit} disabled={loading}>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản khách'}</button>
        {mode === 'login' && <p className="hint auth-hint">Tài khoản nhân viên mặc định: admin / admin123.</p>}
      </section>
    </div>
  );
}

function CustomerHome({ data, submit }: { data?: AnyRow; submit: SubmitFn }) {
  const customer = data?.customer || {};
  const [reserve, setReserve] = useState({ madv: 'DV01', maghe: '', mapr: '', thoigiandat: localDateTimeInput(60) });
  const [pkg, setPkg] = useState({ madv: 'DV03', ngaybatdau: new Date().toISOString().slice(0, 10), id: '' });
  const [item, setItem] = useState({ maorder: '', mavp: '', soluong: '1' });
  const [dialog, setDialog] = useState<AnyRow | null>(null);
  const selectedPackage = data?.packages?.find((row: AnyRow) => String(row.id) === pkg.id.trim());
  const setReserveField = (key: string, value: string) => setReserve((old) => ({ ...old, [key]: value }));
  const setPackageField = (key: string, value: string) => setPkg((old) => ({ ...old, [key]: value }));
  const setItemField = (key: string, value: string) => setItem((old) => ({ ...old, [key]: value }));

  const reserveOrder = async () => {
    const result = await submit('Đặt trước', () => post('/customer/reserve', reserve));
    if (result) setDialog({ title: 'Đặt trước thành công', maorder: (result as AnyRow).maorder, message: (result as AnyRow).message });
  };

  const registerPackage = async () => {
    const result = await submit('Đăng ký gói', () => post('/customer/packages/register', pkg));
    if (result) setDialog({ title: 'Đăng ký gói thành công', id: (result as AnyRow).id, message: (result as AnyRow).message });
  };

  return (
    <div className="grid two">
      {dialog && <ResultDialog data={dialog} onClose={() => setDialog(null)} />}
      <Panel title="Thông tin tài khoản">
        <div className="bill-meta">
          <div><span>Mã KH</span><strong>{customer.makh || '-'}</strong></div>
          <div><span>Họ tên</span><strong>{customer.hoten || '-'}</strong></div>
          <div><span>SĐT</span><strong>{customer.sdt || '-'}</strong></div>
          <div><span>Điểm tích lũy</span><strong>{customer.diemtichluy ?? 0}</strong></div>
          <div><span>Rank</span><strong>{customer.rank || 'Dong'}</strong></div>
          <div><span>Giảm giá</span><strong>{Math.round(Number(customer.discount || 0) * 100)}%</strong></div>
          <div><span>Gói hoạt động</span><strong>{customer.co_goi ? 'Có' : 'Không'}</strong></div>
        </div>
      </Panel>
      <Panel title="Đặt trước">
        <p className="hint">Khách chỉ được đặt trước; order dùng ngay, check-in và thanh toán do nhân viên xử lý.</p>
        <div className="form-grid">
          <SelectField label="Dịch vụ" value={reserve.madv} onChange={(v) => setReserveField('madv', v)}>
            {data?.services?.map((s: AnyRow) => <option key={s.madv} value={s.madv}>{s.madv} - {s.tendv}</option>)}
          </SelectField>
          <SelectField label="Ghế" value={reserve.maghe} onChange={(v) => setReserve((old) => ({ ...old, maghe: v, mapr: v ? '' : old.mapr }))}>
            <option value="">Không dùng ghế</option>
            {data?.seats?.map((s: AnyRow) => <option key={s.maghe} value={s.maghe}>{s.maghe} ({s.mapc})</option>)}
          </SelectField>
          <SelectField label="Phòng riêng" value={reserve.mapr} onChange={(v) => setReserve((old) => ({ ...old, mapr: v, maghe: v ? '' : old.maghe }))}>
            <option value="">Không dùng phòng</option>
            {data?.privateRooms?.map((r: AnyRow) => <option key={r.mapr} value={r.mapr}>{r.mapr} - tối đa {r.songuoitoida}</option>)}
          </SelectField>
          <Field label="Giờ hẹn" value={reserve.thoigiandat} onChange={(v) => setReserveField('thoigiandat', v)} type="datetime-local" />
        </div>
        <button onClick={reserveOrder}>Đặt trước</button>
      </Panel>
      <Panel title="Gói của tôi">
        <p className="hint">Mua gói mới bằng loại gói và ngày bắt đầu. Gia hạn chỉ cần nhập ID gói trong bảng bên dưới; hệ thống không hỗ trợ hủy gói để giữ trạng thái dữ liệu ổn định.</p>
        <div className="form-grid">
          <SelectField label="Gói" value={pkg.madv} onChange={(v) => setPackageField('madv', v)}>
            <option value="DV03">DV03 - Gói 1 ngày</option>
            <option value="DV04">DV04 - Gói 1 tuần</option>
          </SelectField>
          <Field label="Ngày bắt đầu" value={pkg.ngaybatdau} onChange={(v) => setPackageField('ngaybatdau', v)} type="date" />
          <Field label="ID gói cần gia hạn" value={pkg.id} onChange={(v) => setPackageField('id', v)} placeholder="Nhập ID trong bảng" />
          <div className="readonly-field">
            <span>Thời hạn gói đang chọn</span>
            <strong>{packageDurationLabel(pkg.madv)}</strong>
          </div>
        </div>
        {selectedPackage && (
          <div className="bill-meta">
            <div><span>ID gia hạn</span><strong>{selectedPackage.id}</strong></div>
            <div><span>Gói hiện tại</span><strong>{selectedPackage.madv} - {selectedPackage.tendv}</strong></div>
            <div><span>Ngày kết thúc</span><strong>{dateOnly(selectedPackage.ngayketthuc)}</strong></div>
            <div><span>Trạng thái</span><strong>{selectedPackage.status}</strong></div>
          </div>
        )}
        <div className="actions">
          <button onClick={registerPackage}>Mua gói</button>
          <button onClick={() => submit('Gia hạn gói', () => post('/customer/packages/extend', { id: pkg.id }))}>Gia hạn</button>
        </div>
        <Table rows={data?.packages || []} columns={[
          { key: 'id', label: 'ID' },
          { key: 'madv', label: 'Gói' },
          { key: 'tendv', label: 'Tên gói' },
          { key: 'ngaybatdau', label: 'Bắt đầu', render: (r) => dateOnly(r.ngaybatdau) },
          { key: 'ngayketthuc', label: 'Kết thúc', render: (r) => dateOnly(r.ngayketthuc) },
          { key: 'status', label: 'Trạng thái' }
        ]} />
      </Panel>
      <Panel title="Gọi món">
        <p className="hint">Chỉ gọi món được với order của chính bạn đang ở trạng thái Đang dùng.</p>
        <div className="form-grid">
          <SelectField label="Order đang dùng" value={item.maorder} onChange={(v) => setItemField('maorder', v)}>
            <option value="">Chọn order</option>
            {data?.activeOrders?.map((o: AnyRow) => <option key={o.maorder} value={o.maorder}>{o.maorder}</option>)}
          </SelectField>
          <SelectField label="Vật phẩm" value={item.mavp} onChange={(v) => setItemField('mavp', v)}>
            <option value="">Chọn vật phẩm</option>
            {data?.items?.map((vp: AnyRow) => <option key={vp.mavp} value={vp.mavp}>{vp.mavp} - {vp.tenvp} ({vp.soluong})</option>)}
          </SelectField>
          <Field label="Số lượng" value={item.soluong} onChange={(v) => setItemField('soluong', v)} type="number" />
        </div>
        <button onClick={() => submit('Gọi món', () => post('/customer/add-item', item))}>Gọi món</button>
      </Panel>
      <Panel title="Lịch sử orders">
        <Table rows={data?.orders || []} columns={[
          { key: 'maorder', label: 'Order' },
          { key: 'tendv', label: 'Dịch vụ' },
          { key: 'status', label: 'Trạng thái' },
          { key: 'giobatdau', label: 'Bắt đầu', render: (r) => dateTime(r.giobatdau || r.thoigiandat) },
          { key: 'gioketthuc', label: 'Kết thúc', render: (r) => dateTime(r.gioketthuc) }
        ]} />
      </Panel>
      <Panel title="Quà và vinh danh">
        <Table rows={data?.gifts || []} columns={[
          { key: 'thoigiantang', label: 'Thời gian', render: (r) => dateTime(r.thoigiantang) },
          { key: 'loai', label: 'Loại' },
          { key: 'rankcu', label: 'Rank cũ' },
          { key: 'rankmoi', label: 'Rank mới' },
          { key: 'tenqua', label: 'Quà/thưởng' },
          { key: 'hang', label: 'Hạng' },
          { key: 'ky', label: 'Kỳ', render: (r) => r.thang && r.nam ? `${r.thang}/${r.nam}` : '' }
        ]} />
      </Panel>
    </div>
  );
}

function ResultDialog({ data, onClose }: { data: AnyRow; onClose: () => void }) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h2>{data.title || 'Thông báo'}</h2>
        {data.maorder && <p>Mã order: <strong>{data.maorder}</strong></p>}
        {data.id && <p>ID gói: <strong>{data.id}</strong></p>}
        {data.message && <p>{data.message}</p>}
        <button onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}

function Overview({ data }: { data?: AnyRow }) {
  const metrics = data?.metrics || {};
  const cards = [
    ['Tổng orders', metrics.total_orders],
    ['Đang dùng', metrics.active_orders],
    ['Đặt trước', metrics.reserved_orders],
    ['Khách hàng', metrics.customers],
    ['Ghế trống', metrics.shared_seats_available],
    ['Phòng riêng trống', metrics.private_rooms_available],
    ['Vật phẩm thiếu', metrics.low_stock_items],
    ['Tổng doanh thu', money(metrics.total_revenue)]
  ];
  return (
    <>
      <div className="metric-grid">
        {cards.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value ?? 0}</strong>
          </div>
        ))}
      </div>
      <div className="grid two">
        <Panel title="Orders gần nhất">
          <Table rows={data?.recentOrders || []} columns={[
            { key: 'maorder', label: 'Order' },
            { key: 'hoten', label: 'Khách' },
            { key: 'tendv', label: 'Dịch vụ' },
            { key: 'status', label: 'Trạng thái' },
            { key: 'giobatdau', label: 'Bắt đầu', render: (r) => dateTime(r.giobatdau) }
          ]} />
        </Panel>
        <Panel title="Cảnh báo tồn kho">
          <Table rows={data?.lowStock || []} columns={[
            { key: 'mavp', label: 'Mã' },
            { key: 'tenvp', label: 'Tên' },
            { key: 'soluong', label: 'Tồn' },
            { key: 'makho', label: 'Mã kho' },
            { key: 'tenkho', label: 'Tên kho' }
          ]} />
        </Panel>
      </div>
    </>
  );
}

function Orders({ data, lookups, submit }: { data: AnyRow[]; lookups: AnyRow; submit: SubmitFn }) {
  const [form, setForm] = useState({ maorder: '', makh: '', hoten: '', sdt: '', madv: 'DV01', maghe: '', mapr: '', thoigiandat: localDateTimeInput(60), sudunggoi: 'false' });
  const [item, setItem] = useState({ maorder: '', mavp: 'VP01', soluong: '1' });
  const [pay, setPay] = useState({ maorder: '', manv: 'NV01', hinhthuctt: 'Tien mat' });
  const [bill, setBill] = useState<AnyRow | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState('');
  const [dialog, setDialog] = useState<AnyRow | null>(null);
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));

  const refreshBill = async (maorder: string) => {
    if (!maorder) {
      setBill(null);
      setBillError('');
      return;
    }
    setBillLoading(true);
    setBillError('');
    try {
      const value = await api<AnyRow>(`/orders/${encodeURIComponent(maorder)}/bill`);
      setBill(value);
    } catch (err) {
      setBill(null);
      setBillError((err as Error).message);
    } finally {
      setBillLoading(false);
    }
  };

  const selectOrder = (maorder: string) => {
    setItem((old) => ({ ...old, maorder }));
    setPay((old) => ({ ...old, maorder }));
    void refreshBill(maorder);
  };

  const resetOrderForm = () => {
    setForm({
      maorder: '',
      makh: '',
      hoten: '',
      sdt: '',
      madv: 'DV01',
      maghe: '',
      mapr: '',
      thoigiandat: localDateTimeInput(60),
      sudunggoi: 'false'
    });
  };

  const submitOrder = async (label: string, path: string) => {
    const result = await submit(label, () => post(path, { ...form, maorder: '', sudunggoi: form.sudunggoi === 'true' }));
    if (result) {
      setDialog({ title: `${label} thành công`, maorder: (result as AnyRow).maorder, makh: (result as AnyRow).makh, message: (result as AnyRow).message });
      resetOrderForm();
    }
  };

  const checkin = async () => {
    const ok = await submit('Check-in', () => post('/orders/checkin', { maorder: item.maorder }));
    if (ok) await refreshBill(item.maorder);
  };

  const addItem = async () => {
    const ok = await submit('Thêm vật phẩm', () => post('/orders/add-item', item));
    if (ok) await refreshBill(item.maorder);
  };

  const payOrder = async () => {
    const ok = await submit('Thanh toán', () => post('/orders/pay', pay));
    if (ok) setBill(null);
  };

  return (
    <div className="grid two">
      {dialog && <ResultDialog data={dialog} onClose={() => setDialog(null)} />}
      <Panel title="Tạo order / đặt trước">
        <p className="hint">Mã order do hệ thống tự sinh sau khi tạo. Nếu nhập mã KH cũ thì hệ thống giữ khách đó; nếu để trống mã KH, hệ thống tạo khách mới.</p>
        <div className="form-grid">
          <Field label="Mã KH" value={form.makh} onChange={(v) => set('makh', v)} placeholder="Tự sinh nếu KH mới" />
          <Field label="Họ tên" value={form.hoten} onChange={(v) => set('hoten', v)} />
          <Field label="SĐT" value={form.sdt} onChange={(v) => set('sdt', v)} placeholder="09xxxxxxxx" />
          <SelectField label="Dịch vụ" value={form.madv} onChange={(v) => set('madv', v)}>
            {lookups.services?.map((s: AnyRow) => <option key={s.madv} value={s.madv}>{s.madv} - {s.tendv}</option>)}
          </SelectField>
          <SelectField label="Dùng gói" value={form.sudunggoi} onChange={(v) => set('sudunggoi', v)}>
            <option value="false">Không dùng gói</option>
            <option value="true">Dùng gói đang hoạt động</option>
          </SelectField>
          <SelectField label="Ghế" value={form.maghe} onChange={(v) => set('maghe', v)}>
            <option value="">Không dùng ghế</option>
            {lookups.seats?.map((s: AnyRow) => (
              <option key={s.maghe} value={s.maghe}>
                {s.maghe} ({s.mapc}){s.co_the_thu_hoi ? ` - thu hồi từ ${s.order_cu}` : ''}
              </option>
            ))}
          </SelectField>
          <SelectField label="Phòng riêng" value={form.mapr} onChange={(v) => set('mapr', v)}>
            <option value="">Không dùng phòng</option>
            {lookups.privateRooms?.map((r: AnyRow) => (
              <option key={r.mapr} value={r.mapr}>
                {r.mapr}{r.co_the_thu_hoi ? ` - thu hồi từ ${r.order_cu}` : ''}
              </option>
            ))}
          </SelectField>
          <Field label="Giờ hẹn đặt trước" value={form.thoigiandat} onChange={(v) => set('thoigiandat', v)} type="datetime-local" />
        </div>
        <div className="actions">
          <button onClick={() => submitOrder('Tạo order', '/orders/create')}>Tạo dùng ngay</button>
          <button className="secondary" onClick={() => submitOrder('Đặt trước', '/orders/reserve')}>Đặt trước</button>
        </div>
      </Panel>

      <Panel title="Thao tác order">
        <div className="form-grid">
          <SelectField label="Order" value={item.maorder} onChange={selectOrder}>
            <option value="">Chọn order</option>
            {lookups.activeOrders?.map((o: AnyRow) => <option key={o.maorder} value={o.maorder}>{o.maorder} - {o.status}</option>)}
          </SelectField>
          <SelectField label="Vật phẩm" value={item.mavp} onChange={(v) => setItem((o) => ({ ...o, mavp: v }))}>
            {lookups.items?.map((vp: AnyRow) => <option key={vp.mavp} value={vp.mavp}>{vp.mavp} - {vp.tenvp} ({vp.soluong})</option>)}
          </SelectField>
          <Field label="Số lượng" value={item.soluong} onChange={(v) => setItem((o) => ({ ...o, soluong: v }))} type="number" />
          <SelectField label="Nhân viên" value={pay.manv} onChange={(v) => setPay((o) => ({ ...o, manv: v }))}>
            {lookups.employees?.map((nv: AnyRow) => <option key={nv.manv} value={nv.manv}>{nv.manv} - {nv.tennv}</option>)}
          </SelectField>
          <SelectField label="Thanh toán" value={pay.hinhthuctt} onChange={(v) => setPay((o) => ({ ...o, hinhthuctt: v }))}>
            <option>Tien mat</option>
            <option>Chuyen khoan</option>
            <option>The</option>
          </SelectField>
        </div>
        <div className="actions">
          <button onClick={checkin}>Check-in</button>
          <button onClick={addItem}>Thêm vật phẩm</button>
          <button onClick={payOrder}>Thanh toán</button>
        </div>
      </Panel>

      <Panel title="Danh sách orders">
        <p className="hint">Đang hiển thị {data.length.toLocaleString('vi-VN')} order.</p>
        <Table rows={data} columns={[
          { key: 'maorder', label: 'Order' },
          { key: 'makh', label: 'Mã KH' },
          { key: 'hoten', label: 'Khách' },
          { key: 'tendv', label: 'Dịch vụ' },
          { key: 'sudunggoi', label: 'Dùng gói', render: (r) => r.sudunggoi ? 'Có' : 'Không' },
          { key: 'status', label: 'Trạng thái' },
          { key: 'maghe', label: 'Ghế' },
          { key: 'mapr', label: 'Phòng' },
          { key: 'thoigiandat', label: 'Giờ hẹn', render: (r) => dateTime(r.thoigiandat) },
          { key: 'giobatdau', label: 'Bắt đầu', render: (r) => dateTime(r.giobatdau) }
        ]} />
      </Panel>

      <Panel title="Bill thanh toán">
        <OrderBill bill={bill} loading={billLoading} error={billError} />
      </Panel>
    </div>
  );
}

function OrderBill({ bill, loading, error }: { bill: AnyRow | null; loading: boolean; error: string }) {
  if (loading) return <div className="empty">Đang tải bill...</div>;
  if (error) return <div className="notice error compact">{error}</div>;
  if (!bill) return <div className="empty">Chọn order ở khung thao tác để xem bill trước khi thanh toán.</div>;

  const summary = bill.summary || {};
  const totals = bill.totals || {};
  const items = bill.items || [];

  return (
    <div className="bill">
      <div className="bill-meta">
        <div><span>Order</span><strong>{summary.maorder}</strong></div>
        <div><span>Khách</span><strong>{summary.hoten}</strong></div>
        <div><span>Trạng thái</span><strong>{summary.status}</strong></div>
        <div><span>Rank</span><strong>{summary.rank || 'Dong'}</strong></div>
        <div><span>Dùng gói</span><strong>{summary.sudunggoi ? 'Có' : 'Không'}</strong></div>
        {summary.sudunggoi && <div><span>Hạn gói/order</span><strong>{dateTime(summary.gioketthuc)}</strong></div>}
      </div>

      <div className="bill-section">
        <div className="bill-row">
          <span>Dịch vụ</span>
          <strong>{summary.madv} - {summary.tendv}</strong>
          <span>{summary.sudunggoi ? 'Miễn theo gói' : money(summary.gia_dv)}</span>
        </div>
      </div>

      <Table rows={items} columns={[
        { key: 'mavp', label: 'Mã VP' },
        { key: 'tenvp', label: 'Tên VP' },
        { key: 'soluong', label: 'SL' },
        { key: 'dongia', label: 'Đơn giá', render: (r) => money(r.dongia) },
        { key: 'thanhtien', label: 'Thành tiền', render: (r) => money(r.thanhtien) }
      ]} />

      <div className="bill-total">
        <div><span>Tiền dịch vụ</span><strong>{money(totals.tien_dv)}</strong></div>
        <div><span>Tiền vật phẩm</span><strong>{money(totals.tien_vp)}</strong></div>
        <div><span>Phạt quá giờ</span><strong>{money(totals.phat_qua_gio)}</strong></div>
        <div><span>Giảm giá</span><strong>{Number(totals.discount_percent || 0)}%</strong></div>
        <div className="grand"><span>Tổng hóa đơn</span><strong>{money(totals.tong_hd)}</strong></div>
      </div>
    </div>
  );
}

function Rooms({ data }: { data?: AnyRow }) {
  const [suggest, setSuggest] = useState({ soNguoi: '1', loai: 'chung' });
  const [suggestRows, setSuggestRows] = useState<AnyRow[]>([]);
  const [suggestError, setSuggestError] = useState('');
  const setSuggestField = (key: string, value: string) => setSuggest((old) => ({ ...old, [key]: value }));
  const runSuggest = async () => {
    setSuggestError('');
    try {
      const query = paramsToQuery({ soNguoi: suggest.soNguoi, loai: suggest.loai });
      const rows = await api<AnyRow[]>(`/rooms/suggest?${query}`);
      setSuggestRows(rows);
    } catch (err) {
      setSuggestError((err as Error).message);
    }
  };
  return (
    <div className="grid two">
      <Panel title="Gợi ý xếp chỗ">
        <p className="hint">Gọi function fn_xep_cho để tìm ghế/phòng phù hợp theo số người và loại chỗ.</p>
        <div className="form-grid">
          <Field label="Số người" value={suggest.soNguoi} onChange={(v) => setSuggestField('soNguoi', v)} type="number" />
          <SelectField label="Loại chỗ" value={suggest.loai} onChange={(v) => setSuggestField('loai', v)}>
            <option value="chung">Phòng chung</option>
            <option value="rieng">Phòng riêng</option>
            <option value="bat ky">Bất kỳ</option>
          </SelectField>
        </div>
        <div className="actions">
          <button onClick={runSuggest}>Gợi ý chỗ</button>
        </div>
        {suggestError && <div className="notice error compact">{suggestError}</div>}
        <Table rows={suggestRows} columns={[
          { key: 'loai_cho', label: 'Loại' },
          { key: 'ma', label: 'Mã' },
          { key: 'thong_tin', label: 'Thông tin' }
        ]} />
      </Panel>
      <Panel title="Phòng chung còn ghế">
        <Table rows={data?.shared || []} columns={[
          { key: 'mapc', label: 'Phòng' },
          { key: 'soghetrong', label: 'Ghế trống' },
          { key: 'tong_ghe', label: 'Tổng ghế' }
        ]} />
      </Panel>
      <Panel title="Phòng riêng">
        <Table rows={data?.privateRooms || []} columns={[
          { key: 'mapr', label: 'Phòng' },
          { key: 'songuoitoida', label: 'Tối đa' },
          { key: 'hesogia', label: 'Hệ số' },
          { key: 'status', label: 'Trạng thái' }
        ]} />
      </Panel>
      <Panel title="Sơ đồ ghế">
        <div className="seat-grid">
          {(data?.seats || []).map((seat: AnyRow) => (
            <div className={`seat ${seat.status === 'Trong' ? 'free' : 'busy'}`} key={seat.maghe}>
              <strong>{seat.maghe}</strong>
              <span>{seat.mapc}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Inventory({ data, submit }: { data?: AnyRow; submit: SubmitFn }) {
  const [form, setForm] = useState({ mavp: '', soluong: '10' });
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <div className="grid two">
      <Panel title="Nhập kho">
        <p className="hint">Chọn vật phẩm có sẵn; hệ thống tự nhập vào kho cố định của vật phẩm đó.</p>
        <div className="form-grid">
          <SelectField label="Vật phẩm" value={form.mavp} onChange={(v) => set('mavp', v)}>
            <option value="">Chọn vật phẩm</option>
            {data?.items?.map((vp: AnyRow) => (
              <option key={vp.mavp} value={vp.mavp}>
                {vp.mavp} - {vp.tenvp} ({vp.makho} - {vp.tenkho || 'chưa rõ tên'}, tồn {vp.soluong})
              </option>
            ))}
          </SelectField>
          <Field label="Số lượng" value={form.soluong} onChange={(v) => set('soluong', v)} type="number" />
        </div>
        <button onClick={() => submit('Nhập kho', () => post('/inventory/import', form))}>Nhập hàng</button>
      </Panel>
      <Panel title="Cảnh báo thiếu hàng">
        <Table rows={data?.lowStock || []} columns={[
          { key: 'mavp', label: 'Mã' },
          { key: 'tenvp', label: 'Tên' },
          { key: 'soluong', label: 'Tồn' },
          { key: 'makho', label: 'Mã kho' },
          { key: 'tenkho', label: 'Tên kho' }
        ]} />
      </Panel>
      <Panel title="Vật phẩm">
        <Table rows={data?.items || []} columns={[
          { key: 'mavp', label: 'Mã' },
          { key: 'tenvp', label: 'Tên' },
          { key: 'giatien', label: 'Giá', render: (r) => money(r.giatien) },
          { key: 'soluong', label: 'Tồn' },
          { key: 'makho', label: 'Mã kho' },
          { key: 'tenkho', label: 'Tên kho' }
        ]} />
      </Panel>
    </div>
  );
}

function CreateItem({ data, submit }: { data?: AnyRow; submit: SubmitFn }) {
  const [form, setForm] = useState({ mavp: '', tenvp: '', giatien: '10000', soluong: '0', makho: '' });
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const create = async () => {
    const ok = await submit('Tạo vật phẩm', () => post('/inventory/create', form));
    if (ok) setForm({ mavp: '', tenvp: '', giatien: '10000', soluong: '0', makho: '' });
  };
  return (
    <div className="grid two">
      <Panel title="Tạo vật phẩm mới">
        <p className="hint">Tên vật phẩm không được trùng. Chọn kho cố định ngay khi tạo; database sẽ chặn nếu để trống hoặc cố đổi kho sau đó.</p>
        <div className="form-grid">
          <Field label="Mã vật phẩm" value={form.mavp} onChange={(v) => set('mavp', v)} placeholder="VP99" />
          <Field label="Tên vật phẩm" value={form.tenvp} onChange={(v) => set('tenvp', v)} />
          <Field label="Giá" value={form.giatien} onChange={(v) => set('giatien', v)} type="number" />
          <Field label="Số lượng ban đầu" value={form.soluong} onChange={(v) => set('soluong', v)} type="number" />
          <SelectField label="Kho" value={form.makho} onChange={(v) => set('makho', v)}>
            <option value="">Chọn kho</option>
            {data?.warehouses?.map((warehouse: AnyRow) => (
              <option key={warehouse.makho} value={warehouse.makho}>
                {warehouse.makho} - {warehouse.tenkho}
              </option>
            ))}
          </SelectField>
        </div>
        <button onClick={create}>Tạo vật phẩm</button>
      </Panel>
      <Panel title="Phân bổ loại vật phẩm theo kho">
        <Table rows={data?.warehouses?.map((warehouse: AnyRow) => ({
          ...warehouse,
          so_loai: data?.items?.filter((item: AnyRow) => item.makho === warehouse.makho).length || 0
        })) || []} columns={[
          { key: 'makho', label: 'Kho' },
          { key: 'tenkho', label: 'Tên kho' },
          { key: 'so_loai', label: 'Số loại' },
          { key: 'diachi', label: 'Địa chỉ' }
        ]} />
      </Panel>
    </div>
  );
}

function Packages({ rows, lookups, submit }: { rows: AnyRow[]; lookups: AnyRow; submit: SubmitFn }) {
  const [form, setForm] = useState({ makh: '', madv: 'DV03', ngaybatdau: new Date().toISOString().slice(0, 10), id: '' });
  const [dialog, setDialog] = useState<AnyRow | null>(null);
  const [packageInfo, setPackageInfo] = useState<AnyRow | null>(null);
  const [packageLookupError, setPackageLookupError] = useState('');
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));

  useEffect(() => {
    const id = form.id.trim();
    setPackageLookupError('');
    if (!id) {
      setPackageInfo(null);
      return;
    }
    if (!/^\d+$/.test(id)) {
      setPackageInfo(null);
      setPackageLookupError('ID gói phải là số trong bảng danh sách gói.');
      return;
    }

    const localPackage = rows.find((row) => String(row.id) === id);
    if (localPackage) {
      setPackageInfo(localPackage);
      setForm((old) => ({
        ...old,
        makh: localPackage.makh || old.makh,
        madv: localPackage.madv || old.madv
      }));
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const info = await api<AnyRow>(`/packages/${encodeURIComponent(id)}`);
        setPackageInfo(info);
        setForm((old) => ({
          ...old,
          makh: info.makh || old.makh,
          madv: info.madv || old.madv
        }));
      } catch (error) {
        setPackageInfo(null);
        setPackageLookupError((error as Error).message);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [form.id, rows]);

  const registerPackage = async () => {
    const result = await submit('Đăng ký gói', () => post('/packages/register', form));
    if (result) setDialog({ title: 'Đăng ký gói thành công', id: (result as AnyRow).id, message: (result as AnyRow).message });
  };
  return (
    <div className="grid two">
      {dialog && <ResultDialog data={dialog} onClose={() => setDialog(null)} />}
      <Panel title="Quản lý gói">
        <p className="hint">Đăng ký: nhập mã KH, chọn gói/ngày, database tự sinh ID. Gia hạn: nhập ID gói đã có, hệ thống tự hiện khách/gói; không cần chọn khách thủ công.</p>
        <div className="form-grid">
          <Field label="Mã KH đăng ký" value={form.makh} onChange={(v) => set('makh', v.trim().toUpperCase())} placeholder="VD: KH9030" />
          <SelectField label="Gói" value={form.madv} onChange={(v) => set('madv', v)}>
            <option value="DV03">DV03 - Gói 1 ngày</option>
            <option value="DV04">DV04 - Gói 1 tuần</option>
          </SelectField>
          <Field label="Ngày bắt đầu" value={form.ngaybatdau} onChange={(v) => set('ngaybatdau', v)} type="date" />
          <Field label="ID gói cần gia hạn" value={form.id} onChange={(v) => set('id', v)} placeholder="VD: 1290" />
          <div className="readonly-field">
            <span>Thời hạn gói đang chọn</span>
            <strong>{packageDurationLabel(form.madv)}</strong>
          </div>
        </div>
        {packageInfo && (
          <div className="bill-meta">
            <div><span>ID gói</span><strong>{packageInfo.id}</strong></div>
            <div><span>Mã KH</span><strong>{packageInfo.makh}</strong></div>
            <div><span>Khách hàng</span><strong>{packageInfo.hoten}</strong></div>
            <div><span>Gói hiện tại</span><strong>{packageInfo.madv} - {packageInfo.tendv}</strong></div>
            <div><span>Bắt đầu</span><strong>{dateOnly(packageInfo.ngaybatdau)}</strong></div>
            <div><span>Kết thúc</span><strong>{dateOnly(packageInfo.ngayketthuc)}</strong></div>
            <div><span>Trạng thái</span><strong>{packageInfo.status}</strong></div>
          </div>
        )}
        {packageLookupError && <div className="notice error compact">{packageLookupError}</div>}
        <div className="actions">
          <button onClick={registerPackage}>Đăng ký</button>
          <button onClick={() => submit('Gia hạn gói', () => post('/packages/extend', { id: form.id }))}>Gia hạn</button>
          <button className="secondary" onClick={() => submit('Cập nhật trạng thái', () => post('/packages/refresh-status', {}))}>Cập nhật trạng thái</button>
        </div>
      </Panel>
      <Panel title="Danh sách gói">
        <Table rows={rows} columns={[
          { key: 'id', label: 'ID' },
          { key: 'makh', label: 'Mã KH' },
          { key: 'hoten', label: 'Khách' },
          { key: 'madv', label: 'Gói' },
          { key: 'tendv', label: 'Tên gói' },
          { key: 'ngaybatdau', label: 'Bắt đầu', render: (r) => dateOnly(r.ngaybatdau) },
          { key: 'ngayketthuc', label: 'Kết thúc', render: (r) => dateOnly(r.ngayketthuc) },
          { key: 'status', label: 'Trạng thái' }
        ]} />
      </Panel>
    </div>
  );
}

function RankGifts({ data, lookups, submit }: { data?: AnyRow; lookups: AnyRow; submit: SubmitFn }) {
  const customers = data?.customers || lookups.customers || [];
  const [params, setParams] = useState({ thang: '5', nam: '2026', makh: '', hang: '1' });
  const [leaderboard, setLeaderboard] = useState<AnyRow[]>([]);
  const [customerInfo, setCustomerInfo] = useState<AnyRow | null>(null);
  const [error, setError] = useState('');
  const set = (key: string, value: string) => setParams((old) => ({ ...old, [key]: value }));
  const setCustomerCode = (value: string) => set('makh', value.trim().toUpperCase());

  const selectedCustomer = params.makh.trim();

  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadLeaderboard = () => run(async () => {
    const query = paramsToQuery({ thang: params.thang, nam: params.nam });
    setLeaderboard(await api<AnyRow[]>(`/rank-gifts/leaderboard?${query}`));
  });

  const checkCustomer = () => run(async () => {
    if (!selectedCustomer) throw new Error('Chua chon khach hang.');
    setCustomerInfo(await api<AnyRow>(`/rank-gifts/customer/${encodeURIComponent(selectedCustomer)}`));
  });

  const awardMonthly = async () => {
    const ok = await submit('Phát thưởng vinh danh', () => post('/rank-gifts/award-monthly', {
      thang: params.thang,
      nam: params.nam,
      hang: params.hang
    }));
    if (ok) await loadLeaderboard();
  };

  return (
    <div className="grid two">
      <Panel title="Tặng quà khi up rank" action={<Trophy size={22} color="#1f5e9e" />}>
        <p className="hint">Khi thanh toán làm khách lên rank, PostgreSQL tự gọi fn_tang_qua_rankup, trừ kho và ghi lịch sử ở bảng lichsu_quatang.</p>
        <div className="metric-grid compact">
          <div className="metric">
            <span>Quà gợi ý hiện tại</span>
            <strong>{data?.suggestedGift ? `${data.suggestedGift.mavp} - ${data.suggestedGift.tenvp}` : 'Hết quà'}</strong>
          </div>
          <div className="metric">
            <span>Lượt quà đã ghi log</span>
            <strong>{data?.logs?.length || 0}</strong>
          </div>
        </div>
        <Table rows={data?.logs || []} columns={[
          { key: 'thoigiantang', label: 'Thời gian', render: (r) => dateTime(r.thoigiantang) },
          { key: 'loai', label: 'Loại' },
          { key: 'makh', label: 'Mã KH' },
          { key: 'hoten', label: 'Khách' },
          { key: 'rankcu', label: 'Rank cũ' },
          { key: 'rankmoi', label: 'Rank mới' },
          { key: 'mavp', label: 'Mã quà' },
          { key: 'tenqua', label: 'Quà/thưởng' },
          { key: 'hang', label: 'Hạng' },
          { key: 'ky', label: 'Kỳ', render: (r) => r.thang && r.nam ? `${r.thang}/${r.nam}` : '' }
        ]} />
      </Panel>

      <Panel title="Khách hàng & rank">
        <Table rows={customers} columns={[
          { key: 'makh', label: 'Mã KH' },
          { key: 'hoten', label: 'Khách' },
          { key: 'diemtichluy', label: 'Điểm' },
          { key: 'rank', label: 'Rank' },
          { key: 'discount', label: 'Giảm giá', render: (r) => `${Math.round(Number(r.discount || 0) * 100)}%` },
          { key: 'co_goi', label: 'Có gói', render: (r) => r.co_goi ? 'Có' : 'Không' }
        ]} />
      </Panel>

      <Panel title="Tra cứu rank khách hàng">
        <p className="hint">Nhập mã KH để tra nhanh; dropdown chỉ dùng khi muốn chọn theo tên.</p>
        <div className="form-grid">
          <label className="field">
            <span>Mã khách hàng</span>
            <input
              value={params.makh}
              placeholder="KH14"
              onChange={(event) => setCustomerCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  checkCustomer();
                }
              }}
            />
          </label>
          <SelectField label="Chọn theo tên" value={selectedCustomer} onChange={(v) => setCustomerCode(v)}>
            <option value="">Chọn KH</option>
            {customers.map((kh: AnyRow) => <option key={kh.makh} value={kh.makh}>{kh.makh} - {kh.hoten}</option>)}
          </SelectField>
        </div>
        <div className="actions">
          <button onClick={checkCustomer}>Tra mã KH</button>
        </div>
        {error && <div className="notice error compact">{error}</div>}
        {customerInfo ? (
          <div className="bill-meta">
            <div><span>Mã KH</span><strong>{customerInfo.makh}</strong></div>
            <div><span>Khách hàng</span><strong>{customerInfo.hoten}</strong></div>
            <div><span>Điểm tích lũy</span><strong>{customerInfo.diemtichluy}</strong></div>
            <div><span>Rank hiện tại</span><strong>{customerInfo.rank}</strong></div>
            <div><span>Giảm giá</span><strong>{Math.round(Number(customerInfo.discount || 0) * 100)}%</strong></div>
            <div><span>Gói hoạt động</span><strong>{customerInfo.co_goi ? 'Có' : 'Không'}</strong></div>
          </div>
        ) : (
          <div className="empty">Chọn khách hàng rồi bấm Kiểm tra KH để xem rank.</div>
        )}
      </Panel>

      <Panel title="Vinh danh tháng">
        <p className="hint">Chọn tháng/năm để xếp hạng. Khi bấm phát thưởng, hệ thống lấy đúng khách ở hạng đó và chặn thưởng lại cùng hạng trong cùng tháng.</p>
        <div className="form-grid">
          <Field label="Tháng" value={params.thang} onChange={(v) => set('thang', v)} type="number" />
          <Field label="Năm" value={params.nam} onChange={(v) => set('nam', v)} type="number" />
          <Field label="Hạng thưởng" value={params.hang} onChange={(v) => set('hang', v)} type="number" />
        </div>
        <div className="actions">
          <button onClick={loadLeaderboard}>Xem vinh danh</button>
          <button className="secondary" onClick={awardMonthly}>Phát thưởng hạng</button>
        </div>
        <Table rows={leaderboard} columns={[
          { key: 'hang', label: 'Hạng' },
          { key: 'makh', label: 'Mã KH' },
          { key: 'hoten', label: 'Khách' },
          { key: 'diem', label: 'Điểm' },
          { key: 'uu_dai', label: 'Ưu đãi' }
        ]} />
      </Panel>
    </div>
  );
}

function Staff({ data, submit }: { data?: AnyRow; submit: SubmitFn }) {
  const employees = data?.employees || [];
  const [assign, setAssign] = useState({ manv: '', ngay: '', cathu: 'Ca Sang' });
  const [swap, setSwap] = useState({ manv1: '', ngay1: '', cathu1: 'Ca Sang', manv2: '', ngay2: '', cathu2: 'Ca Sang' });
  const [substitute, setSubstitute] = useState({ manvThay: '', manvNghi: '', ngay: '', cathu: 'Ca Sang' });
  const setAssignField = (key: string, value: string) => setAssign((old) => ({ ...old, [key]: value }));
  const setSwapField = (key: string, value: string) => setSwap((old) => ({ ...old, [key]: value }));
  const setSubstituteField = (key: string, value: string) => setSubstitute((old) => ({ ...old, [key]: value }));
  return (
    <div className="grid two">
      <Panel title="Nhận ca">
        <p className="hint">Thêm nhân viên vào một ca còn thiếu. Database sẽ tự chặn nếu ca đã đủ 3 người hoặc nhân viên đã có ca đó.</p>
        <div className="form-grid">
          <SelectField label="Nhân viên" value={assign.manv} onChange={(v) => setAssignField('manv', v)}><EmployeeOptions rows={employees} /></SelectField>
          <Field label="Ngày nhận" value={assign.ngay} onChange={(v) => setAssignField('ngay', v)} type="date" />
          <SelectField label="Ca nhận" value={assign.cathu} onChange={(v) => setAssignField('cathu', v)}><ShiftOptions /></SelectField>
        </div>
        <div className="actions">
          <button onClick={() => submit('Nhận ca', () => post('/staff/assign', assign))}>Nhận ca</button>
        </div>
      </Panel>
      <Panel title="Đổi ca">
        <p className="hint">Dùng khi hai nhân viên đã có hai ca khác nhau và muốn đổi chéo lịch cho nhau.</p>
        <div className="form-grid">
          <SelectField label="NV 1" value={swap.manv1} onChange={(v) => setSwapField('manv1', v)}><EmployeeOptions rows={employees} /></SelectField>
          <Field label="Ngày 1" value={swap.ngay1} onChange={(v) => setSwapField('ngay1', v)} type="date" />
          <SelectField label="Ca 1" value={swap.cathu1} onChange={(v) => setSwapField('cathu1', v)}><ShiftOptions /></SelectField>
          <SelectField label="NV 2" value={swap.manv2} onChange={(v) => setSwapField('manv2', v)}><EmployeeOptions rows={employees} /></SelectField>
          <Field label="Ngày 2" value={swap.ngay2} onChange={(v) => setSwapField('ngay2', v)} type="date" />
          <SelectField label="Ca 2" value={swap.cathu2} onChange={(v) => setSwapField('cathu2', v)}><ShiftOptions /></SelectField>
        </div>
        <div className="actions">
          <button onClick={() => submit('Đổi ca', () => post('/staff/swap', swap))}>Đổi ca</button>
        </div>
      </Panel>
      <Panel title="Làm thay">
        <p className="hint">Dùng khi một nhân viên nghỉ, nhân viên khác nhận đúng ca đó thay người nghỉ.</p>
        <div className="form-grid">
          <SelectField label="NV thay" value={substitute.manvThay} onChange={(v) => setSubstituteField('manvThay', v)}><EmployeeOptions rows={employees} /></SelectField>
          <SelectField label="NV nghỉ" value={substitute.manvNghi} onChange={(v) => setSubstituteField('manvNghi', v)}><EmployeeOptions rows={employees} /></SelectField>
          <Field label="Ngày thay" value={substitute.ngay} onChange={(v) => setSubstituteField('ngay', v)} type="date" />
          <SelectField label="Ca thay" value={substitute.cathu} onChange={(v) => setSubstituteField('cathu', v)}><ShiftOptions /></SelectField>
        </div>
        <div className="actions">
          <button onClick={() => submit('Làm thay', () => post('/staff/substitute', substitute))}>Làm thay</button>
        </div>
      </Panel>
      <Panel title="Ca thiếu người">
        <Table rows={data?.shortage || []} columns={[
          { key: 'ngay', label: 'Ngày', render: (r) => dateOnly(r.ngay) },
          { key: 'cathu', label: 'Ca' },
          { key: 'status', label: 'Trạng thái' },
          { key: 'so_nv', label: 'Số NV' },
          { key: 'thieu_nv', label: 'Thiếu' },
          { key: 'nhanvien', label: 'Nhân viên' }
        ]} />
      </Panel>
      <Panel title="Lịch ca gần tới">
        <Table rows={data?.upcomingShifts || []} columns={[
          { key: 'ngay', label: 'Ngày', render: (r) => dateOnly(r.ngay) },
          { key: 'cathu', label: 'Ca' },
          { key: 'status', label: 'Trạng thái' },
          { key: 'so_nv', label: 'Số NV' },
          { key: 'nhanvien', label: 'Nhân viên' }
        ]} />
      </Panel>
    </div>
  );
}

function EmployeeOptions({ rows }: { rows: AnyRow[] }) {
  return (
    <>
      <option value="">Chọn nhân viên</option>
      {rows.map((nv) => <option key={nv.manv} value={nv.manv}>{nv.manv} - {nv.tennv}</option>)}
    </>
  );
}

function ShiftOptions() {
  return (
    <>
      <option>Ca Sang</option>
      <option>Ca Chieu</option>
      <option>Ca Toi</option>
    </>
  );
}

function Reports() {
  const [params, setParams] = useState({ thang: '5', nam: '2026', tungay: '2026-05-01', denngay: '2026-05-31', top: '10' });
  const [report, setReport] = useState<AnyRow>({});
  const [error, setError] = useState('');
  const set = (key: string, value: string) => setParams((old) => ({ ...old, [key]: value }));
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setError('');
    try {
      const value = await fn();
      setReport((old) => ({ ...old, [key]: value }));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const revenueMonthQuery = useMemo(() => paramsToQuery({ thang: params.thang, nam: params.nam }), [params.thang, params.nam]);
  const monthQuery = useMemo(() => paramsToQuery({ thang: params.thang, nam: params.nam, top: params.top }), [params.thang, params.nam, params.top]);
  const rangeQuery = useMemo(() => paramsToQuery({ tungay: params.tungay, denngay: params.denngay }), [params.tungay, params.denngay]);
  return (
    <div className="grid two">
      {error && <div className="notice error">{error}</div>}
      <Panel title="Tham số báo cáo">
        <div className="report-groups">
          <div className="report-group">
            <h3>Theo tháng</h3>
            <div className="form-grid">
              <Field label="Tháng" value={params.thang} onChange={(v) => set('thang', v)} type="number" />
              <Field label="Năm" value={params.nam} onChange={(v) => set('nam', v)} type="number" />
              <Field label="Top vật phẩm" value={params.top} onChange={(v) => set('top', v)} type="number" />
            </div>
            <div className="actions">
              <button onClick={() => run('revenue', () => api(`/reports/revenue?${revenueMonthQuery}`))}>Doanh thu tháng</button>
              <button onClick={() => run('topItems', () => api(`/reports/top-items?${monthQuery}`))}>Top vật phẩm</button>
              <button onClick={() => run('salary', () => api(`/staff/salary?${monthQuery}`))}>Lương</button>
              <button onClick={() => run('earlyLeave', () => api(`/staff/early-leave?${monthQuery}`))}>Nghỉ sớm</button>
            </div>
          </div>

          <div className="report-group">
            <h3>Theo khoảng ngày</h3>
            <div className="form-grid">
              <Field label="Từ ngày" value={params.tungay} onChange={(v) => set('tungay', v)} type="date" />
              <Field label="Đến ngày" value={params.denngay} onChange={(v) => set('denngay', v)} type="date" />
            </div>
            <div className="actions">
              <button onClick={() => run('revenue', () => api(`/reports/revenue?${rangeQuery}`))}>Doanh thu khoảng ngày</button>
              <button onClick={() => run('timeSlots', () => api(`/reports/time-slots?${rangeQuery}`))}>Khung giờ</button>
              <button onClick={() => run('performance', () => api(`/reports/employee-performance?${rangeQuery}`))}>Hiệu suất NV</button>
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Doanh thu">
        <Table rows={report.revenue ? [report.revenue] : []} columns={[
          { key: 'so_order', label: 'Số order' },
          { key: 'tong_doanh_thu', label: 'Tổng doanh thu', render: (r) => money(r.tong_doanh_thu) },
          { key: 'trung_binh_hd', label: 'Trung bình/HĐ', render: (r) => money(r.trung_binh_hd) },
          { key: 'tong_tu_dv', label: 'Từ dịch vụ', render: (r) => money(r.tong_tu_dv) },
          { key: 'tong_tu_vp', label: 'Từ vật phẩm', render: (r) => money(r.tong_tu_vp) }
        ]} />
      </Panel>
      <Panel title="Top vật phẩm">
        <Table rows={report.topItems || []} columns={[
          { key: 'hang', label: '#' },
          { key: 'mavp', label: 'Mã' },
          { key: 'tenvp', label: 'Tên' },
          { key: 'tong_soluong', label: 'SL' },
          { key: 'tong_doanhthu', label: 'Doanh thu', render: (r) => money(r.tong_doanhthu) }
        ]} />
      </Panel>
      <Panel title="Khung giờ">
        <Table rows={report.timeSlots || []} columns={[
          { key: 'khung_gio', label: 'Khung' },
          { key: 'luot_su_dung', label: 'Lượt' },
          { key: 'doanh_thu', label: 'Doanh thu', render: (r) => money(r.doanh_thu) },
          { key: 'xep_hang_luot', label: 'Rank lượt' }
        ]} />
      </Panel>
      <Panel title="Hiệu suất nhân viên">
        <Table rows={report.performance || []} columns={[
          { key: 'ma_nv', label: 'Mã NV' },
          { key: 'ten_nv', label: 'Nhân viên' },
          { key: 'so_luong_order', label: 'Số order' },
          { key: 'doanh_thu_dich_vu', label: 'Doanh thu DV', render: (r) => money(r.doanh_thu_dich_vu) },
          { key: 'doanh_thu_vat_pham', label: 'Doanh thu VP', render: (r) => money(r.doanh_thu_vat_pham) },
          { key: 'tong_doanh_thu', label: 'Tổng doanh thu', render: (r) => money(r.tong_doanh_thu) }
        ]} />
      </Panel>
      <Panel title="Lương nhân viên">
        <Table rows={report.salary || []} columns={[
          { key: 'manv', label: 'Mã NV' },
          { key: 'tennv', label: 'Nhân viên' },
          { key: 'so_ca', label: 'Số ca' },
          { key: 'hesoluong', label: 'Hệ số' },
          { key: 'nghi_som', label: 'Nghỉ sớm' },
          { key: 'tong_luong', label: 'Tổng lương', render: (r) => money(r.tong_luong) }
        ]} />
      </Panel>
      <Panel title="Nhân viên nghỉ sớm">
        <Table rows={report.earlyLeave || []} columns={[
          { key: 'ma_nv', label: 'Mã NV' },
          { key: 'ten_nv', label: 'Nhân viên' },
          { key: 'so_lan_nghi_som', label: 'Số lần' },
          { key: 'tong_thoi_gian', label: 'Tổng thời gian', render: (r) => duration(r.tong_thoi_gian) }
        ]} />
      </Panel>
    </div>
  );
}
