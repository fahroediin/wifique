// WiFique Dashboard App
const API_BASE = '/api';

// State
let currentPage = 'dashboard';
let users = [];
let payments = [];
let stats = {};

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('wifique-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('wifique-theme', newTheme);
    updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    if (icon && text) {
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        text.textContent = theme === 'dark' ? 'Light' : 'Dark';
    }
}

// Initialize theme immediately
initTheme();

// Check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        showDashboard();
    } else {
        showLogin();
    }

    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Login form
    document.getElementById('adminLoginForm').addEventListener('submit', handleLogin);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // User form
    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);

    // Payment form
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
}

// API helper
async function api(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || 'Request failed');
    }
    return result;
}

// Auth functions
async function checkAuth() {
    try {
        const result = await api('/auth/check');
        if (result.authenticated) {
            document.getElementById('adminName').textContent = result.admin.name;
            return true;
        }
    } catch (e) { }
    return false;
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;

    try {
        const result = await api('/auth/login', 'POST', { username, password });
        document.getElementById('adminName').textContent = result.admin.name;
        showDashboard();
    } catch (error) {
        alert(error.message);
    }
}

async function handleLogout() {
    try {
        await api('/auth/logout', 'POST');
        showLogin();
    } catch (error) {
        console.error(error);
    }
}

// View management
function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('adminLoginForm').reset();
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    navigateTo('dashboard');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebar.classList.toggle('active');

    if (overlay) {
        overlay.classList.toggle('active');
    }
}

// Navigation
function navigateTo(page) {
    currentPage = page;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        users: 'Manajemen User',
        payments: 'Pembayaran',
        bandwidth: 'Bandwidth Monitor',
        settings: 'Pengaturan'
    };
    document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

    // Load page content
    loadPageContent(page);
}

async function loadPageContent(page) {
    const container = document.getElementById('pageContent');

    switch (page) {
        case 'dashboard':
            await loadDashboard(container);
            break;
        case 'users':
            await loadUsers(container);
            break;
        case 'payments':
            await loadPayments(container);
            break;
        case 'bandwidth':
            await loadBandwidth(container);
            break;
        case 'settings':
            await loadSettings(container);
            break;
    }
}

// Dashboard Page
async function loadDashboard(container) {
    try {
        stats = await api('/dashboard/stats');
        const upcoming = await api('/dashboard/upcoming');

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" stroke="currentColor" stroke-width="2"/></svg></div>
                    <div class="stat-value">${stats.users.total}</div>
                    <div class="stat-label">Total User</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" stroke-width="2"/><path d="M22 4L12 14.01l-3-3" stroke="currentColor" stroke-width="2"/></svg></div>
                    <div class="stat-value">${stats.users.active}</div>
                    <div class="stat-label">User Aktif</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon yellow"><svg viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg></div>
                    <div class="stat-value">${stats.payments.pending}</div>
                    <div class="stat-label">Menunggu Bayar</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon red"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2"/></svg></div>
                    <div class="stat-value">${stats.payments.overdue}</div>
                    <div class="stat-label">Overdue</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="currentColor" stroke-width="2"/></svg></div>
                    <div class="stat-value">Rp ${formatNumber(stats.revenue.thisMonth)}</div>
                    <div class="stat-label">Pendapatan Bulan Ini</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3>Tagihan Mendatang</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Unit</th>
                                <th>Jatuh Tempo</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${upcoming.length === 0 ? `
                                <tr><td colspan="5" style="text-align:center;color:var(--text-secondary)">Tidak ada tagihan</td></tr>
                            ` : upcoming.map(p => `
                                <tr>
                                    <td>${escapeHtml(p.user_name)}</td>
                                    <td>${escapeHtml(p.unit_name)}</td>
                                    <td>${formatDate(p.due_date)}</td>
                                    <td>${getDueBadge(p.days_until_due)}</td>
                                    <td>
                                        <button class="btn btn-success btn-sm" onclick="showPaymentModal(${p.id}, '${escapeHtml(p.user_name)}', '${escapeHtml(p.unit_name)}', ${p.amount}, ${p.period_month}, ${p.period_year})">
                                            Bayar
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="card"><p>Error loading dashboard: ${error.message}</p></div>`;
    }
}

// Users Page
async function loadUsers(container) {
    try {
        users = await api('/users');

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Daftar User</h3>
                    <button class="btn btn-primary" onclick="showUserModal()">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2"/></svg>
                        Tambah User
                    </button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Nama</th>
                                <th>Unit</th>
                                <th>Bandwidth</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.length === 0 ? `
                                <tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Belum ada user</td></tr>
                            ` : users.map(u => `
                                <tr>
                                    <td>${escapeHtml(u.username)}</td>
                                    <td>${escapeHtml(u.name)}</td>
                                    <td>${escapeHtml(u.unit_name)}</td>
                                    <td>${u.bandwidth_limit} Mbps</td>
                                    <td>
                                        <span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">
                                            ${u.is_active ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-ghost btn-sm" onclick="editUser(${u.id})">Edit</button>
                                            <button class="btn btn-${u.is_active ? 'warning' : 'success'} btn-sm" onclick="toggleUser(${u.id})">
                                                ${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                            </button>
                                            <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Hapus</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
    }
}

// Payments Page
async function loadPayments(container) {
    try {
        payments = await api('/payments');

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Riwayat Pembayaran</h3>
                    <button class="btn btn-primary" onclick="generateMonthlyPayments()">
                        Generate Tagihan Bulan Ini
                    </button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Unit</th>
                                <th>Periode</th>
                                <th>Jumlah</th>
                                <th>Jatuh Tempo</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payments.length === 0 ? `
                                <tr><td colspan="7" style="text-align:center;color:var(--text-secondary)">Belum ada data pembayaran</td></tr>
                            ` : payments.map(p => `
                                <tr>
                                    <td>${escapeHtml(p.user_name)}</td>
                                    <td>${escapeHtml(p.unit_name)}</td>
                                    <td>${getMonthName(p.period_month)} ${p.period_year}</td>
                                    <td>Rp ${formatNumber(p.amount)}</td>
                                    <td>${formatDate(p.due_date)}</td>
                                    <td>
                                        <span class="badge ${getPaymentBadgeClass(p.status)}">
                                            ${getPaymentStatus(p.status)}
                                        </span>
                                    </td>
                                    <td>
                                        ${p.status === 'pending' ? `
                                            <div class="action-buttons">
                                                <button class="btn btn-primary btn-sm" onclick="generateQRPayment(${p.id})" title="Generate QR QRIS">📱 QR</button>
                                                <button class="btn btn-success btn-sm" onclick="showPaymentModal(${p.id}, '${escapeHtml(p.user_name)}', '${escapeHtml(p.unit_name)}', ${p.amount}, ${p.period_month}, ${p.period_year})">✓ Bayar</button>
                                                <button class="btn btn-danger btn-sm" onclick="markOverdue(${p.id})">Overdue</button>
                                            </div>
                                        ` : p.status === 'overdue' ? `
                                            <div class="action-buttons">
                                                <button class="btn btn-primary btn-sm" onclick="generateQRPayment(${p.id})" title="Generate QR QRIS">📱 QR</button>
                                                <button class="btn btn-success btn-sm" onclick="showPaymentModal(${p.id}, '${escapeHtml(p.user_name)}', '${escapeHtml(p.unit_name)}', ${p.amount}, ${p.period_month}, ${p.period_year})">✓ Bayar</button>
                                            </div>
                                        ` : `
                                            <span class="badge badge-secondary">Lunas</span>
                                        `}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
    }
}

// Bandwidth Page
async function loadBandwidth(container) {
    try {
        const usage = await api('/bandwidth/usage');

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Penggunaan Bandwidth</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Unit</th>
                                <th>Limit</th>
                                <th>Download</th>
                                <th>Upload</th>
                                <th>Total</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usage.length === 0 ? `
                                <tr><td colspan="7" style="text-align:center;color:var(--text-secondary)">Belum ada data</td></tr>
                            ` : usage.map(u => `
                                <tr>
                                    <td>${escapeHtml(u.name)}</td>
                                    <td>${escapeHtml(u.unit_name)}</td>
                                    <td>${u.bandwidth_limit} Mbps</td>
                                    <td>${u.total_download}</td>
                                    <td>${u.total_upload}</td>
                                    <td>${u.total_usage}</td>
                                    <td>
                                        <span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">
                                            ${u.is_active ? 'Online' : 'Offline'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
    }
}

// Settings Page
async function loadSettings(container) {
    try {
        const settings = await api('/settings');

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Pengaturan Sistem</h3>
                </div>
                <form id="settingsForm">
                    <div class="form-group">
                        <label>Nama SSID WiFi</label>
                        <input type="text" id="settingSSID" value="${escapeHtml(settings.wifi_ssid || 'Wifique')}">
                    </div>
                    <div class="form-group">
                        <label>Biaya Bulanan (Rp)</label>
                        <input type="number" id="settingFee" value="${settings.monthly_fee || 100000}">
                    </div>
                    <div class="form-group">
                        <label>Hari Reminder (H-x, pisahkan dengan koma)</label>
                        <input type="text" id="settingReminder" value="${escapeHtml(settings.reminder_days || '3,1,0')}" placeholder="3,1,0">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="settingAutoDisconnect" ${settings.auto_disconnect === 'true' ? 'checked' : ''}>
                            Auto disconnect jika overdue
                        </label>
                    </div>
                    <button type="submit" class="btn btn-primary">Simpan Pengaturan</button>
                </form>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3>💳 Integrasi Pakasir (Payment Gateway)</h3>
                </div>
                <form id="pakasirForm">
                    <div class="form-group">
                        <label>Project Slug</label>
                        <input type="text" id="pakasirProject" value="${escapeHtml(settings.pakasir_project || '')}" placeholder="nama-proyek-anda">
                        <small style="color:var(--text-secondary)">Dapatkan dari dashboard Pakasir</small>
                    </div>
                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" id="pakasirApiKey" value="${escapeHtml(settings.pakasir_api_key || '')}" placeholder="API Key dari Pakasir">
                    </div>
                    <div class="form-group">
                        <label>Webhook URL (copy ke Pakasir)</label>
                        <input type="text" id="webhookUrl" value="${window.location.origin}/api/pakasir/webhook" readonly style="background:var(--bg-primary)">
                        <small style="color:var(--text-secondary)">Set URL ini di Edit Proyek Pakasir</small>
                    </div>
                    <button type="submit" class="btn btn-primary">Simpan Pakasir</button>
                </form>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3>Ubah Password Admin</h3>
                </div>
                <form id="passwordForm">
                    <div class="form-group">
                        <label>Password Saat Ini</label>
                        <input type="password" id="currentPassword" required>
                    </div>
                    <div class="form-group">
                        <label>Password Baru</label>
                        <input type="password" id="newPassword" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Ubah Password</button>
                </form>
            </div>
        `;

        // Settings form handler
        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await api('/settings/bulk', 'POST', {
                    wifi_ssid: document.getElementById('settingSSID').value,
                    monthly_fee: document.getElementById('settingFee').value,
                    reminder_days: document.getElementById('settingReminder').value,
                    auto_disconnect: document.getElementById('settingAutoDisconnect').checked ? 'true' : 'false'
                });
                alert('Pengaturan berhasil disimpan');
            } catch (error) {
                alert(error.message);
            }
        });

        // Pakasir form handler
        document.getElementById('pakasirForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await api('/settings/bulk', 'POST', {
                    pakasir_project: document.getElementById('pakasirProject').value,
                    pakasir_api_key: document.getElementById('pakasirApiKey').value
                });
                alert('Pengaturan Pakasir berhasil disimpan');
            } catch (error) {
                alert(error.message);
            }
        });

        // Password form handler
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await api('/auth/change-password', 'POST', {
                    currentPassword: document.getElementById('currentPassword').value,
                    newPassword: document.getElementById('newPassword').value
                });
                alert('Password berhasil diubah');
                document.getElementById('passwordForm').reset();
            } catch (error) {
                alert(error.message);
            }
        });
    } catch (error) {
        container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
    }
}

// Modal functions
function showModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function showUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const form = document.getElementById('userForm');

    form.reset();
    document.getElementById('userId').value = '';

    if (userId) {
        const user = users.find(u => u.id === userId);
        if (user) {
            title.textContent = 'Edit User';
            document.getElementById('userId').value = user.id;
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userUsername').disabled = true;
            document.getElementById('userName').value = user.name;
            document.getElementById('userUnit').value = user.unit_name;
            document.getElementById('userPhone').value = user.phone_number;
            document.getElementById('userBandwidth').value = user.bandwidth_limit;
        }
    } else {
        title.textContent = 'Tambah User';
        document.getElementById('userUsername').disabled = false;
    }

    showModal('userModal');
}

function editUser(id) {
    showUserModal(id);
}

async function handleUserSubmit(e) {
    e.preventDefault();

    const userId = document.getElementById('userId').value;
    const data = {
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        name: document.getElementById('userName').value,
        unit_name: document.getElementById('userUnit').value,
        phone_number: document.getElementById('userPhone').value,
        bandwidth_limit: parseInt(document.getElementById('userBandwidth').value)
    };

    try {
        if (userId) {
            // Update
            await api(`/users/${userId}`, 'PUT', data);
            if (data.password) {
                await api(`/users/${userId}/password`, 'PUT', { password: data.password });
            }
        } else {
            // Create
            if (!data.password) {
                alert('Password wajib diisi untuk user baru');
                return;
            }
            await api('/users', 'POST', data);
        }

        closeModal('userModal');
        loadUsers(document.getElementById('pageContent'));
    } catch (error) {
        alert(error.message);
    }
}

async function toggleUser(id) {
    try {
        await api(`/users/${id}/toggle`, 'POST');
        loadUsers(document.getElementById('pageContent'));
    } catch (error) {
        alert(error.message);
    }
}

async function deleteUser(id) {
    if (!confirm('Yakin ingin menghapus user ini?')) return;

    try {
        await api(`/users/${id}`, 'DELETE');
        loadUsers(document.getElementById('pageContent'));
    } catch (error) {
        alert(error.message);
    }
}

// Payment functions
function showPaymentModal(id, userName, unitName, amount, month, year) {
    document.getElementById('paymentId').value = id;
    document.getElementById('paymentUserName').textContent = userName;
    document.getElementById('paymentUnit').textContent = unitName;
    document.getElementById('paymentAmount').textContent = 'Rp ' + formatNumber(amount);
    document.getElementById('paymentPeriod').textContent = getMonthName(month) + ' ' + year;
    document.getElementById('paymentNotes').value = '';
    showModal('paymentModal');
}

async function handlePaymentSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('paymentId').value;
    const notes = document.getElementById('paymentNotes').value;

    try {
        await api(`/payments/${id}/pay`, 'POST', { notes });
        closeModal('paymentModal');

        if (currentPage === 'payments') {
            loadPayments(document.getElementById('pageContent'));
        } else {
            loadDashboard(document.getElementById('pageContent'));
        }
    } catch (error) {
        alert(error.message);
    }
}

async function markOverdue(id) {
    if (!confirm('Tandai sebagai overdue? User akan dinonaktifkan.')) return;

    try {
        await api(`/payments/${id}/overdue`, 'POST');
        loadPayments(document.getElementById('pageContent'));
    } catch (error) {
        alert(error.message);
    }
}

async function generateMonthlyPayments() {
    const now = new Date();

    try {
        const result = await api('/payments/generate', 'POST', {
            month: now.getMonth() + 1,
            year: now.getFullYear()
        });
        alert(result.message);
        loadPayments(document.getElementById('pageContent'));
    } catch (error) {
        alert(error.message);
    }
}

// Generate QR Payment via Pakasir
async function generateQRPayment(paymentId) {
    try {
        const result = await api(`/pakasir/create/${paymentId}`, 'POST', { method: 'qris' });

        if (result.success) {
            // Show QR modal
            const payment = result.payment;
            const qrContainer = document.createElement('div');
            qrContainer.innerHTML = `
                <div class="modal" id="qrModal" style="display:flex">
                    <div class="modal-content" style="text-align:center">
                        <div class="modal-header">
                            <h3>💳 Pembayaran QRIS</h3>
                            <button class="modal-close" onclick="document.getElementById('qrModal').remove()">&times;</button>
                        </div>
                        <div class="payment-info">
                            <p><strong>${escapeHtml(payment.user_name)}</strong> - ${escapeHtml(payment.unit_name)}</p>
                            <p style="font-size:24px;font-weight:bold;color:#22c55e">Rp ${formatNumber(payment.total_payment)}</p>
                        </div>
                        <div id="qrcode" style="margin:20px auto;background:white;padding:20px;border-radius:10px;display:inline-block"></div>
                        <p style="color:var(--text-secondary);font-size:12px">Order ID: ${payment.order_id}</p>
                        <p style="color:var(--text-secondary);font-size:12px">Expired: ${new Date(payment.expired_at).toLocaleString('id-ID')}</p>
                        <div class="modal-footer" style="justify-content:center">
                            <button class="btn btn-ghost" onclick="copyPaymentLink('${payment.order_id}')">📋 Copy Link</button>
                            <button class="btn btn-primary" onclick="document.getElementById('qrModal').remove()">Tutup</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(qrContainer);

            // Generate QR code using QRCode library or simple text
            const qrDiv = document.getElementById('qrcode');
            if (window.QRCode) {
                new QRCode(qrDiv, {
                    text: payment.qr_string,
                    width: 200,
                    height: 200
                });
            } else {
                // Fallback: show as text
                qrDiv.innerHTML = '<p style="color:#333;word-break:break-all;font-size:10px;max-width:250px">' + payment.qr_string + '</p>';
            }
        }
    } catch (error) {
        alert('Gagal generate QR: ' + error.message);
    }
}

function copyPaymentLink(orderId) {
    const link = window.location.origin + '/api/pakasir/status/' + orderId;
    navigator.clipboard.writeText(link);
    alert('Link copied!');
}

// Helper functions
function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num);
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getMonthName(month) {
    const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months[month];
}

function getPaymentBadgeClass(status) {
    switch (status) {
        case 'paid': return 'badge-success';
        case 'pending': return 'badge-warning';
        case 'overdue': return 'badge-danger';
        default: return 'badge-secondary';
    }
}

function getPaymentStatus(status) {
    switch (status) {
        case 'paid': return 'Lunas';
        case 'pending': return 'Pending';
        case 'overdue': return 'Overdue';
        default: return status;
    }
}

function getDueBadge(days) {
    if (days < 0) return '<span class="badge badge-danger">Lewat</span>';
    if (days <= 3) return '<span class="badge badge-warning">H-' + Math.round(days) + '</span>';
    return '<span class="badge badge-secondary">H-' + Math.round(days) + '</span>';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
