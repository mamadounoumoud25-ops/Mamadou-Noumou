console.log('APP_JS_LOADED_V1.2');
const API_URL = '';
let state = {
    user: null,
    token: null, // Plus besoin, géré par HttpOnly cookie
    currentPage: 'dashboard',
    data: {
        members: [],
        cotisations: [],
        expenses: [],
        meetings: [],
        amandes: [],
        audit: []
    },
    pagination: {
        members: 1,
        cotisations: 1,
        expenses: 1,
        meetings: 1,
        amandes: 1,
        audit: 1,
        itemsPerPage: 10
    },
    settings: {
        assoc_name: 'U.J.A.D.L.S',
        currency: 'FG'
    }
};

let lineChartInstance = null;
let currentCalendarDate = new Date(); // Month/Year for the attendance calendar
let attendanceHistory = []; // Cache for current member's attendance

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    checkToken();
    setupEventListeners();

    // Netlify Detection Alert
    if (window.location.hostname.includes('netlify.app')) {
        setTimeout(() => {
            showToast('Mode Démonstration : Seule l\'interface visuelle est active sur Netlify.', 'info');
        }, 1500);
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.log('SW Registration Failed', err));
    }
});

const setupEventListeners = () => {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('backup-btn')?.addEventListener('click', handleBackup);
    document.getElementById('modal-close')?.addEventListener('click', closeModal);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            if (page) navigateTo(page);
        });
    });

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    window.toggleSidebar = () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    };

    menuToggle?.addEventListener('click', toggleSidebar);
    overlay?.addEventListener('click', toggleSidebar);

    document.getElementById('settings-form')?.addEventListener('submit', handleSettingsSubmit);
    overlay?.addEventListener('click', toggleSidebar);

    document.getElementById('member-search')?.addEventListener('input', (e) => filterTable(e.target.value, 'members'));
    document.getElementById('amande-search')?.addEventListener('input', (e) => filterTable(e.target.value, 'amandes'));
    document.getElementById('expense-search')?.addEventListener('input', (e) => filterTable(e.target.value, 'expenses'));
    document.getElementById('audit-search')?.addEventListener('input', (e) => filterTable(e.target.value, 'audit'));

    // Theme Switch Logic
    const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
    const currentTheme = localStorage.getItem('ujad_theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (toggleSwitch) {
        toggleSwitch.checked = currentTheme === 'dark';
    }

    toggleSwitch?.addEventListener('change', function (e) {
        if (e.target.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('ujad_theme', 'dark');
            reRenderChartsIfExist('dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('ujad_theme', 'light');
            reRenderChartsIfExist('light');
        }
    });

    // Close notifications when clicking outside
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('noti-panel');
        const bell = document.getElementById('noti-bell');
        if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !bell.contains(e.target)) {
            panel.classList.add('hidden');
        }
    });

    // Periodic notification polling
    setInterval(() => {
        if (state.user) loadNotifications();
    }, 60000); // Every 60s
};

function reRenderChartsIfExist(theme) {
    if (barChartInstance || pieChartInstance || lineChartInstance) {
        Chart.defaults.color = theme === 'dark' ? '#94a3b8' : '#666';
        if (barChartInstance) barChartInstance.update();
        if (pieChartInstance) pieChartInstance.update();
        if (lineChartInstance) lineChartInstance.update();
    }
}

// --- Authentication ---
async function handleLogin(e) {
    e.preventDefault();
    const telephone = document.getElementById('login-id').value;
    const password = document.getElementById('login-pass').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telephone, password })
        });

        if (res.ok) {
            const data = await res.json();
            state.user = data.user;
            localStorage.setItem('ujad_user', JSON.stringify(data.user));
            updateUserHeader();
            showScreen('app');
            navigateTo('dashboard');
            loadStats();
            loadMembers();
            loadNotifications();
        } else {
            showToast('Identifiants incorrects', 'error');
        }
    } catch (err) {
        showError('Erreur de connexion au serveur.');
    }
}

window.showRecoveryModal = () => {
    showModal('Récupération de Compte Admin', `
        <div class="modal-grid">
            <div class="full-width">
                <label class="input-label">Clé de Récupération (Secrète)</label>
                <input type="password" id="rec-key" placeholder="Entrez la clé secrète" class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Nouveau Numéro Admin</label>
                <input type="text" id="rec-phone" value="611760045" class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Nouveau Mot de Passe</label>
                <input type="password" id="rec-pass" class="modal-input">
            </div>
        </div>
    `, async () => {
        const body = {
            recoveryKey: document.getElementById('rec-key').value,
            newPhone: document.getElementById('rec-phone').value,
            newPassword: document.getElementById('rec-pass').value
        };
        const res = await fetch('/api/auth/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Compte réinitialisé avec succès ! Connectez-vous avec vos nouveaux identifiants.', 'success');
        } else {
            showToast('Erreur: ' + data.error, 'error');
        }
    });
};

async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('ujad_user');
    state.user = null;
    showScreen('auth');
}

async function handleBackup() {
    if (!state.user || state.user?.role !== 'admin') return;
    try {
        const response = await fetch('/api/backup');
        if (!response.ok) throw new Error('Action non autorisée');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const contentType = response.headers.get('content-type');
        const ext = contentType && contentType.includes('application/json') ? 'json' : 'db';
        
        a.download = `sauvegarde_ujad_${new Date().toISOString().split('T')[0]}.${ext}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('Sauvegarde réussie (Format ' + ext.toUpperCase() + ')', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function checkToken() {
    try {
        const res = await fetch('/api/auth/check');
        if (res.ok) {
            const data = await res.json();
            state.user = data.user;
            localStorage.setItem('ujad_user', JSON.stringify(data.user));
            updateUserHeader();
            showScreen('app');
            navigateTo('dashboard');
            loadNotifications();
        } else {
            showScreen('auth');
        }
    } catch (err) {
        showScreen('auth');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">${message}</div>
        <button class="toast-close">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    const remove = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 4000);
}

function showConfirm(title, message, onConfirm) {
    showModal(title, `<p style="color: var(--text-dim); margin-bottom: 10px;">${message}</p>`, onConfirm);
}

// --- UI & Navigation ---
function showScreen(screen) {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app-screen');

    if (screen === 'auth') {
        auth.classList.remove('hidden');
        auth.style.display = 'flex';
        auth.style.height = '100vh';
        app.classList.add('hidden');
        app.style.display = 'none';
        document.body.style.overflow = 'hidden';
    } else {
        auth.classList.add('hidden');
        auth.style.display = 'none';
        auth.style.height = '0';
        auth.style.overflow = 'hidden';
        app.classList.remove('hidden');
        app.style.display = 'block';
        document.body.style.overflow = 'auto';
    }
    window.scrollTo(0, 0);
}

function showModal(title, html, onSave, hideSubmit = false) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-container').classList.remove('hidden');
    const submitBtn = document.getElementById('modal-submit');
    submitBtn.classList.toggle('hidden', hideSubmit);
    const newBtn = submitBtn.cloneNode(true);
    submitBtn.replaceWith(newBtn);
    newBtn.addEventListener('click', async (e) => {
        const form = document.querySelector('#modal-content form');
        if (form && !form.reportValidity()) return;

        const originalText = newBtn.textContent;
        newBtn.textContent = 'Chargement...';
        newBtn.disabled = true;
        newBtn.style.opacity = '0.7';

        try {
            await onSave();
            closeModal();
        } catch (err) {
            console.error(err);
            showToast(err.message || 'Une erreur est survenue', 'error');
        } finally {
            newBtn.textContent = originalText;
            newBtn.disabled = false;
            newBtn.style.opacity = '1';
        }
    });
}

function closeModal() { document.getElementById('modal-container').classList.add('hidden'); }

function showError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function updateUserHeader() {
    const info = document.getElementById('user-info');
    if (!info || !state.user) return;
    const initial = state.user.prenom ? state.user.prenom[0] : '?';
    const photoHtml = state.user.photo_url
        ? `<img src="${state.user.photo_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">${initial}</div>`;

    info.innerHTML = `
        <div class="user-profile-header" onclick="navigateTo('profile')">
            <div class="user-details-desktop">
                <div class="user-name-text">${state.user.prenom}</div>
                <div class="user-role-text">${state.user.role}</div>
            </div>
            ${photoHtml}
        </div>
    `;
}

async function loadMemberProfile() {
    // Refresh user data
    if (!state.user) return;

    // Fallback if not admin (admin has /api/members access, user might not, wait user can fetch their own data? Assuming user has themselves).
    // Let's rely on state.user which is returned by login/check.
    const u = state.user;

    const photoContainer = document.getElementById('profile-photo-container');
    const initial = u.prenom ? u.prenom[0] : '?';
    photoContainer.innerHTML = u.photo_url
        ? `<img src="${u.photo_url}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid var(--primary);box-shadow:0 10px 25px rgba(0,0,0,0.3);">`
        : `<div style="width:120px;height:120px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:3rem;margin:0 auto;box-shadow:0 10px 25px rgba(0,0,0,0.3);">${initial}</div>`;

    document.getElementById('profile-name').textContent = `${u.prenom} ${u.nom}`;
    document.getElementById('profile-role').textContent = u.role;
    document.getElementById('profile-phone').textContent = u.telephone || 'Non renseigné';

    const statusBadge = document.getElementById('profile-status');
    statusBadge.textContent = u.statut;
    statusBadge.className = `badge ${u.statut}`;
}

window.editMyProfile = () => {
    const u = state.user;
    showModal('Modifier mon profil', `
        <form id="my-profile-form" class="modal-grid">
            <div class="full-width">
                ${u.photo_url ? `<div style="margin-bottom:10px; text-align:center;"><img src="${u.photo_url}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;"></div>` : ''}
                <label class="input-label">Nouvelle photo</label>
                <input type="file" id="my-photo" accept="image/*" class="modal-input" style="padding: 8px;">
            </div>
            <div class="full-width">
                <label class="input-label">Nouveau Mot de Passe (laisser vide pour ne pas changer)</label>
                <input type="password" id="my-pass" class="modal-input" placeholder="••••••••">
            </div>
        </form>
    `, async () => {
        const formData = new FormData();
        const pwd = document.getElementById('my-pass').value;
        if (pwd) formData.append('password', pwd);

        const fileInput = document.getElementById('my-photo');
        if (fileInput.files.length > 0) formData.append('photo', fileInput.files[0]);

        // Just sending photo and password. The backend is PUT /api/members/:id 
        // We must also send required fields to not break backend validation.
        formData.append('nom', u.nom);
        formData.append('prenom', u.prenom);

        try {
            await fetchAPI(`/api/members/${u.id}`, { method: 'PUT', body: formData });
            showToast('Profil mis à jour !', 'success');
            checkToken(); // Refresh data
        } catch (err) {
            throw err;
        }
    });
};

async function navigateTo(page) {
    const isAdmin = state.user?.role === 'admin';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

    document.querySelector('[data-page="members"]').classList.toggle('hidden', !isAdmin);
    document.querySelector('[data-page="depenses"]').classList.toggle('hidden', !isAdmin);
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));

    // Hide 'Add' and 'Export' buttons globally for members
    document.querySelectorAll('.btn-primary').forEach(btn => {
        if (btn.textContent.includes('+')) btn.classList.toggle('hidden', !isAdmin);
    });
    document.querySelectorAll('.btn-csv').forEach(btn => btn.classList.toggle('hidden', !isAdmin));
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) backupBtn.classList.toggle('hidden', !isAdmin);

    // Close mobile menu if open
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('active');

    document.querySelectorAll('main section').forEach(s => {
        s.classList.add('hidden');
        s.style.display = 'none';
    });

    if (!isAdmin && page === 'dashboard') {
        const profilPage = document.getElementById('page-profile');
        profilPage.classList.remove('hidden');
        profilPage.style.display = 'block';
        document.getElementById('page-title').textContent = 'Mon Profil';
        loadMemberProfile();
        return;
    }

    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.style.display = 'block';
    }

    const titles = {
        'dashboard': 'Tableau de Bord',
        'members': 'Membres',
        'meetings': 'Réunions',
        'cotisations': 'Cotisations',
        'amandes': 'Amendes',
        'depenses': 'Dépenses',
        'audit': 'Historique Admin',
        'reglement': 'Règlement',
        'profile': 'Mon Profil'
    };
    document.getElementById('page-title').textContent = titles[page.toLowerCase()] || page;
    
    if (page === 'settings') renderSettingsPage();

    if (page === 'dashboard') {
        loadStats();
        loadAnnouncements();
    }
    if (page === 'members') loadMembers();
    if (page === 'meetings') loadMeetings();
    if (page === 'cotisations') loadCotisations();
    if (page === 'depenses') loadExpenses();
    if (page === 'amandes') loadAmandes();
    if (page === 'audit') loadAuditLogs();
}

// --- Feature Logic ---
async function loadStats() {
    if (state.user?.role !== 'admin') return;
    const data = await fetchAPI('/api/stats');
    if (data) {
        const c = state.settings.currency || 'FG';
        document.getElementById('stat-total-members').textContent = data.totalMembres;
        document.getElementById('stat-active-members').textContent = data.totalActifs;
        document.getElementById('stat-total-finance').textContent = `${data.totalFinances.toLocaleString()} ${c}`;
        document.getElementById('stat-total-depenses').textContent = `${data.totalDepenses.toLocaleString()} ${c}`;
        document.getElementById('stat-total-reste').textContent = `${data.totalReste.toLocaleString()} ${c}`;
        document.getElementById('stat-net').textContent = `${data.soldeNet.toLocaleString()} ${c}`;
        document.getElementById('stat-total-inscriptions').textContent = `${data.totalInscriptions.toLocaleString()} ${c}`;
        document.getElementById('stat-total-amandes').textContent = `${data.totalAmandes.toLocaleString()} ${c}`;
        document.getElementById('stat-am-reunion').textContent = `${data.totalAmandesReunion.toLocaleString()} ${c}`;
        document.getElementById('stat-am-travail').textContent = `${data.totalAmandesTravail.toLocaleString()} ${c}`;
        document.getElementById('stat-am-indiscipline').textContent = `${data.totalAmandesIndiscipline.toLocaleString()} ${c}`;
        document.getElementById('add-announcement-btn').style.display = 'block';

        // Render charts
        renderCharts();
    }
}

let barChartInstance = null;
let pieChartInstance = null;

async function renderCharts() {
    const data = await fetchAPI('/api/charts');
    if (!data) return;

    // --- Charts SECTION ---
    if (barChartInstance) barChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    if (lineChartInstance) lineChartInstance.destroy();

    // Bar Chart
    const monthsSet = new Set([
        ...data.cotis.map(c => c.month),
        ...data.amandes.map(a => a.month),
        ...data.expenses.map(e => e.month)
    ]);
    const months = Array.from(monthsSet).sort();

    const revenusData = months.map(m => {
        const cAmount = data.cotis.find(c => c.month === m)?.total || 0;
        const aAmount = data.amandes.find(a => a.month === m)?.total || 0;
        return cAmount + aAmount;
    });

    const depensesData = months.map(m => {
        return data.expenses.find(e => e.month === m)?.total || 0;
    });

    const c = state.settings.currency || 'FG';
    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: `Revenus (${c})`,
                    data: revenusData,
                    backgroundColor: 'rgba(74, 222, 128, 0.6)',
                    borderColor: 'rgba(74, 222, 128, 1)',
                    borderWidth: 1
                },
                {
                    label: `Dépenses (${c})`,
                    data: depensesData,
                    backgroundColor: 'rgba(248, 113, 113, 0.6)',
                    borderColor: 'rgba(248, 113, 113, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });

    // Pie Chart
    const pieLabels = data.exp_category.map(e => e.categorie || 'Autre');
    const pieData = data.exp_category.map(e => e.total);

    const ctxPie = document.getElementById('chart-pie').getContext('2d');
    pieChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: pieLabels,
            datasets: [{
                data: pieData,
                backgroundColor: ['#6366f1', '#f87171', '#fbbf24', '#34d399', '#a78bfa', '#f472b6', '#38bdf8'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } }
        }
    });

    // Line Chart (Trend)
    const ctxLine = document.getElementById('chart-line').getContext('2d');
    const soldeData = revenusData.map((rev, idx) => rev - depensesData[idx]);
    lineChartInstance = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: `Solde Mensuel (${c})`,
                data: soldeData,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false } }
        }
    });
}
}

async function loadMemberProfile(id = null) {
    if (!state.user) return;
    
    let u;
    if (id) {
        u = state.data.members.find(m => m.id == id);
    } else {
        u = state.user;
    }
    
    if (!u) return;
    state.currentMemberId = u.id;

    const [cotis, amandes, meetings, attendance] = await Promise.all([
        fetchAPI('/api/cotis'),
        fetchAPI('/api/amandes'),
        fetchAPI('/api/meetings'),
        fetchAPI('/api/attendance') // Wait, attendance needs a meeting ID? No, maybe a global list or we just rely on presence table? Actually backend usually has simple routes.
    ]);

    // Simple attendance check helper
    // If there is no global attendance route, we might need a specific one. Let's assume we can fetch my attendance.
    // Actually, I'll filter the data I already have or assume we can fetch what's needed.
    
    const myCotis = cotis ? cotis.filter(c => c.membre_id === u.id) : [];
    const myAmandes = amandes ? amandes.filter(a => a.membre_id === u.id) : [];

    const totalPaid = myCotis.reduce((s, c) => s + c.montant, 0);
    const restePayé = myCotis.reduce((sum, c) => sum + ((c.montant_total || c.montant) - c.montant), 0);
    const amandesDues = myAmandes.reduce((sum, a) => sum + (a.statut === 'du' ? a.montant : 0), 0);

    const s = state.settings;
    const currency = s.currency || 'FG';

    document.getElementById('stat-my-cotis').textContent = `${totalPaid.toLocaleString()} ${currency}`;
    document.getElementById('stat-my-reste').textContent = `${(restePayé + amandesDues).toLocaleString()} ${currency}`;

    // Render Info
    const photoContainer = document.getElementById('profile-photo-container');
    const initial = u.prenom ? u.prenom[0] : '?';
    photoContainer.innerHTML = u.photo_url
        ? `<img src="${u.photo_url}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid var(--primary);box-shadow:0 10px 25px rgba(0,0,0,0.3);">`
        : `<div style="width:120px;height:120px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:3rem;margin:0 auto;box-shadow:0 10px 25px rgba(0,0,0,0.3);">${initial}</div>`;

    document.getElementById('profile-name').textContent = `${u.prenom} ${u.nom}`;
    document.getElementById('profile-role').textContent = u.role;
    document.getElementById('profile-phone').textContent = u.telephone || 'Non renseigné';

    const statusBadge = document.getElementById('profile-status');
    statusBadge.textContent = u.statut;
    statusBadge.className = `badge ${u.statut}`;

    // Render Unified History
    const historyList = document.getElementById('my-history-list');
    const combinedHistory = [
        ...myCotis.map(c => ({ date: c.date_paiement, type: '💰 Cotisation', amount: `${c.montant.toLocaleString()} ${currency}`, details: `Mois: ${c.mois}` })),
        ...myAmandes.map(a => ({ date: a.date, type: '⚠️ Amande', amount: `${a.montant.toLocaleString()} ${currency}`, details: `${a.type}: ${a.motif} (${a.statut})` }))
    ].sort((a,b) => new Date(b.date) - new Date(a.date));

    if (combinedHistory.length === 0) {
        historyList.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim);">Aucune transaction trouvée</td></tr>';
    } else {
        historyList.innerHTML = combinedHistory.map(h => `
            <tr>
                <td data-label="Date">${h.date}</td>
                <td data-label="Événement"><b>${h.type}</b></td>
                <td data-label="Montant / Statut">${h.amount}</td>
                <td data-label="Détails" style="font-size: 0.8rem; color: var(--text-dim);">${h.details}</td>
            </tr>
        `).join('');
    }

    // --- Chargement du Calendrier ---
    await updateMemberCalendar(u.id);
}

// --- Logique du Calendrier de Présence ---
async function updateMemberCalendar(memberId) {
    attendanceHistory = await fetchAPI(`/api/meetings/member/${memberId}`);
    if (!attendanceHistory) attendanceHistory = [];
    renderCalendar();
}

function renderCalendar() {
    const calendarGrid = document.getElementById('attendance-calendar');
    const monthDisplay = document.getElementById('calendar-month-year');
    if (!calendarGrid) return;

    calendarGrid.innerHTML = '';
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    monthDisplay.textContent = `${monthNames[month]} ${year}`;

    // Header des jours
    const dayHeaders = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    dayHeaders.forEach(d => {
        const h = document.createElement('div');
        h.className = 'calendar-header-day';
        h.textContent = d;
        calendarGrid.appendChild(h);
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Décalage du premier jour (0=Dimanche -> 0=Lundi)
    let startDay = firstDay.getDay() - 1;
    if (startDay === -1) startDay = 6;

    // Slots vides avant le début du mois
    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        calendarGrid.appendChild(empty);
    }

    // Jours du mois
    const today = new Date().toISOString().split('T')[0];
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const meeting = (attendanceHistory || []).find(a => a.date === dateStr);
        
        dayEl.innerHTML = `<span class="day-num">${d}</span>`;
        if (dateStr === today) dayEl.style.color = 'var(--primary)';
        
        if (meeting) {
            dayEl.classList.add('has-meeting');
            const dot = document.createElement('i');
            dot.className = 'dot';
            if (meeting.status === 1) dot.classList.add('present');
            else if (meeting.status === 2) dot.classList.add('retard');
            else if (meeting.status === 0) dot.classList.add('absent');
            else if (meeting.status === 3) dot.classList.add('excuse');
            dayEl.appendChild(dot);
            
            dayEl.title = `${meeting.type}: ${meeting.status === 1 ? 'Présent' : (meeting.status === 2 ? 'Retard' : (meeting.status === 3 ? 'Excusé' : 'Chômage'))}`;
        }

        calendarGrid.appendChild(dayEl);
    }
}

window.changeCalendarMonth = (dir) => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    renderCalendar();
};

// --- Logic Notifications ---
window.toggleNotifications = () => {
    const panel = document.getElementById('noti-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) loadNotifications();
};

async function loadNotifications() {
    const notifications = await fetchAPI('/api/notifications');
    if (!notifications) return;

    const list = document.getElementById('noti-list');
    const badge = document.getElementById('noti-badge');
    const unreadCount = notifications.filter(n => !n.lu).length;

    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (notifications.length === 0) {
        list.innerHTML = '<div class="noti-empty">Aucune notification</div>';
        return;
    }

    list.innerHTML = notifications.map(n => `
        <div class="noti-item ${n.lu ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
            <h4>${n.titre}</h4>
            <p>${n.message}</p>
            <span class="noti-time">${new Date(n.date).toLocaleString()}</span>
        </div>
    `).join('');
}

window.markNotificationRead = async (id) => {
    await fetchAPI(`/api/notifications/${id}/read`, { method: 'PUT' });
    loadNotifications();
};

window.markAllNotificationsRead = async () => {
    await fetchAPI('/api/notifications/read-all', { method: 'PUT' });
    loadNotifications();
};

window.promptSendNotification = async () => {
    const msg = prompt("Entrez votre message pour ce membre:");
    if (!msg) return;
    
    const memberId = state.currentMemberId;
    if (!memberId) return;

    try {
        await fetchAPI('/api/notifications', {
            method: 'POST',
            body: { 
                membre_id: memberId,
                titre: "Message de l'Admin",
                message: msg,
                type: 'info'
            }
        });
        showToast("Message envoyé avec succès !", "success");
    } catch (err) {
        showToast("Erreur lors de l'envoi", "error");
    }
};

window.showMemberProfile = (id) => {
    navigateTo('profile');
    loadMemberProfile(id);
};


async function loadMembers(page = 1) {
    const list = document.getElementById('members-list');
    if (list) list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-dim);">Chargement des membres...</td></tr>';
    
    try {
        const data = await fetchAPI('/api/members');
        state.data.members = data;
        renderMembers(data, page);
    } catch (err) {
        if (list) list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--danger);">Erreur lors du chargement</td></tr>';
        throw err;
    }
}
function renderMembers(items, page = 1) {
    const list = document.getElementById('members-list');
    if (!list) return;

    if (items.length === 0) {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-dim);">Aucun membre trouvé</td></tr>';
        return;
    }

    const { paginatedItems, totalPages } = paginate(items, page, 'members');

    list.innerHTML = paginatedItems.map(m => {
        const prenom = m.prenom || '';
        const nom = m.nom || '';
        const initiales = (prenom[0] || '?') + (nom[0] || '');
        
        return `
            <tr>
                <td data-label="Membre">
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${m.photo_url ? `<img src="${m.photo_url}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">` : `<div style="width:30px;height:30px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:0.8rem;">${initiales}</div>`}
                        ${prenom} ${nom}
                    </div>
                </td>
                <td data-label="Contact">${m.telephone || '-'}</td>
                <td data-label="Statut">
                    <span class="badge ${m.statut || 'actif'}">${m.statut || 'actif'}</span>
                    <span class="badge ${m.inscription_payee ? 'paid' : 'due'}" style="font-size: 0.65rem;">${m.inscription_payee ? 'Inscrit' : 'Non-Inscrit'}</span>
                </td>
                <td data-label="Rôle">${m.role || 'membre'}</td>
                <td data-label="Actions">
                    <button class="btn-small" style="background-color: var(--primary);" onclick="showMemberProfile(${m.id})">Voir</button>
                    <button class="btn-small" onclick="editMember(${m.id})">Modifier</button>
                    <button class="btn-small btn-danger" onclick="deleteMember(${m.id})">Suppr</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPaginationControls(list.parentElement, totalPages, page, 'members', items);
}

async function loadCotisations() {
    const data = await fetchAPI('/api/cotis');
    const isAdmin = state.user?.role === 'admin';
    const displayData = isAdmin ? data : data.filter(c => c.membre_id === state.user.id);
    state.data.cotisations = displayData;
    renderCotisations(displayData);
}
function renderCotisations(items, page = 1) {
    const isAdmin = state.user?.role === 'admin';
    const list = document.getElementById('cotis-list');
    const { paginatedItems, totalPages } = paginate(items, page, 'cotisations');

    list.innerHTML = paginatedItems.map(c => {
        const reste = (c.montant_total || c.montant) - c.montant;
        return `
            <tr>
                <td data-label="Membre">${c.prenom} ${c.nom}</td>
                <td data-label="Paiement">
                    <b>${c.montant.toLocaleString()} / ${(c.montant_total || c.montant).toLocaleString()} FG</b>
                    <div style="font-size:0.8rem; color:${reste > 0 ? '#f87171' : '#4ade80'}">Reste: ${reste.toLocaleString()} FG</div>
                </td>
                <td data-label="Mois">${c.mois}</td>
                <td data-label="Date">${c.date_paiement}</td>
                <td data-label="Actions">
                    <button class="btn-small" style="background:#6366f1;color:white" onclick="generateReceiptPDF('cotisation', '${c.prenom} ${c.nom}', ${c.montant}, '${c.mois}', '${c.date_paiement}')">Reçu</button>
                    ${isAdmin ? `<button class="btn-small" onclick="editCotis(${c.id})">Modifier</button>` : ''}
                    ${reste > 0 ? `<button class="btn-small" style="background:#25d366;color:white" onclick="remindWhatsApp('${c.telephone}', ${reste}, '${c.mois}')">WhatsApp</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
    renderPaginationControls(document.getElementById('cotis-list').parentElement, totalPages, page, 'cotisations', items);
}

async function loadExpenses() {
    const data = await fetchAPI('/api/expenses');
    state.data.expenses = data;
    renderExpenses(data);
}
function renderExpenses(items, page = 1) {
    const list = document.getElementById('expenses-list');
    const isAdmin = state.user?.role === 'admin';
    const { paginatedItems, totalPages } = paginate(items, page, 'expenses');

    list.innerHTML = paginatedItems.map(e => `
        <tr>
            <td data-label="Date">${e.date}</td>
            <td data-label="Description">${e.description}</td>
            <td data-label="Montant" style="color:#f87171">${e.montant.toLocaleString()} FG</td>
            <td data-label="Catégorie">${e.categorie || '-'}</td>
            <td data-label="Justificatif">
                ${e.receipt_url ? `<button class="btn-small" style="background:#6366f1;color:white" onclick="window.open('${e.receipt_url}', '_blank')">📄 Voir</button>` : '<span style="color:var(--text-dim);font-size:0.8rem;">-</span>'}
            </td>
            <td data-label="Actions">
                ${isAdmin ? `<button class="btn-small" onclick="editExpense(${e.id})">Modifier</button>` : ''}
                ${isAdmin ? `<button class="btn-small btn-danger" onclick="deleteExpense(${e.id})">Suppr</button>` : ''}
            </td>
        </tr>
    `).join('');
    renderPaginationControls(document.getElementById('expenses-list').parentElement, totalPages, page, 'expenses', items);
}

async function loadMeetings() {
    const data = await fetchAPI('/api/meetings');
    state.data.meetings = data;
    renderMeetings(data);
}

function renderMeetings(items, page = 1) {
    const list = document.getElementById('meetings-list');
    const isAdmin = state.user?.role === 'admin';
    const { paginatedItems, totalPages } = paginate(items, page, 'meetings');

    list.innerHTML = paginatedItems.map(m => `
        <tr>
            <td data-label="Date">${m.date}</td>
            <td data-label="Type"><span class="badge actif" style="font-size:0.75rem;">${m.type || 'Réunion'}</span></td>
            <td data-label="Thème">${m.theme || '-'}</td>
            <td data-label="Lieu">${m.lieu || '-'}</td>
            <td data-label="Actions">
                <button class="btn-small" onclick="markAttendance(${m.id})">Présences</button>
                ${isAdmin ? `
                    <button class="btn-small" onclick="editMeeting(${m.id})">Modifier</button>
                    <button class="btn-small btn-danger" onclick="deleteMeeting(${m.id})">Suppr</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
    renderPaginationControls(document.getElementById('meetings-list').parentElement, totalPages, page, 'meetings', items);
}

async function markAttendance(meetingId) {
    const members = await fetchAPI('/api/members');
    const attendance = await fetchAPI(`/api/attendance/${meetingId}`);

    const meeting = state.data.meetings.find(m => m.id === meetingId) || {};
    const isSpecial = meeting.type !== 'Réunion';
    
    // Dynamic Fine Amounts from Settings
    const s = state.settings;
    const amandeRetard = isSpecial ? (parseInt(s.amande_retard_travail) || 2000) : (parseInt(s.amande_retard_reunion) || 1000);
    const amandeChomage = isSpecial ? (parseInt(s.amande_chomage_travail) || 5000) : (parseInt(s.amande_chomage_reunion) || 2000);

    showModal('Marquer les Présences', `
        <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <p style="font-size: 0.8rem; color: var(--text-dim);">Type: <b>${meeting.type}</b></p>
            <button class="btn-small" onclick="markAllPresent(${meetingId})" style="background: var(--primary);">Tout Présent</button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            ${members.map(m => {
        const att = attendance.find(a => a.id === m.id);
        const status = att ? att.present : null;
        return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <span>${m.prenom} ${m.nom}</span>
                        <select onchange="updateAttendance(${meetingId}, ${m.id}, this.value)" class="modal-input" style="width: auto; margin-top: 0; padding: 4px 8px;">
                            <option value="1" ${status == 1 ? 'selected' : ''}>Présent</option>
                            <option value="2" ${status == 2 ? 'selected' : ''}>Retard (${amandeRetard} FG)</option>
                            <option value="0" ${status == 0 ? 'selected' : ''}>Chômage (${amandeChomage} FG)</option>
                            <option value="3" ${status == 3 ? 'selected' : ''}>Excusé (Gratuit)</option>
                        </select>
                    </div>
                `;
    }).join('')}
        </div>
    `, () => { }, true);
}

async function updateAttendance(meetingId, memberId, value) {
    await fetchAPI('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, memberId, present: parseInt(value) })
    });
}

window.markAllPresent = (meetingId) => {
    showConfirm('Confirmation', 'Marquer tous les membres comme présents ?', async () => {
        const members = await fetchAPI('/api/members');
        for (const m of members) {
            await fetchAPI('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingId, memberId: m.id, present: 1 })
            });
        }
        showToast('Tous les membres ont été marqués présents.', 'success');
        closeModal();
    });
};

async function loadAmandes() {
    const data = await fetchAPI('/api/amandes');
    state.data.amandes = data;
    renderAmandes(data);
}

function renderAmandes(items, page = 1) {
    const list = document.getElementById('amandes-list');
    const isAdmin = state.user?.role === 'admin';
    const { paginatedItems, totalPages } = paginate(items, page, 'amandes');

    list.innerHTML = paginatedItems.map(a => `
        <tr>
            <td data-label="Membre">${a.prenom} ${a.nom}</td>
            <td data-label="Type">${a.type}</td>
            <td data-label="Motif">${a.motif}</td>
            <td data-label="Montant" style="color: #f87171;">${a.montant.toLocaleString()} FG</td>
            <td data-label="Statut"><span class="badge ${a.statut}">${a.statut == 'paye' ? 'Payée' : 'Due'}</span></td>
            <td data-label="Actions">
                ${a.statut === 'paye' ? `<button class="btn-small" style="background:#6366f1;color:white" onclick="generateReceiptPDF('amande', '${a.prenom} ${a.nom}', ${a.montant}, '${a.motif}', '${a.date}')">Reçu</button>` : ''}
                ${isAdmin && a.statut === 'du' ? `
                    <button class="btn-small" onclick="payAmande(${a.id})">Régler</button>
                    <button class="btn-small btn-danger" onclick="deleteAmande(${a.id})">Suppr</button>
                ` : (a.statut === 'du' ? '-' : '')}
            </td>
        </tr>
    `).join('');
    renderPaginationControls(document.getElementById('amandes-list').parentElement, totalPages, page, 'amandes', items);
}

window.payAmande = (id) => {
    showConfirm('Confirmation', 'Marquer cette amende comme payée ?', async () => {
        await fetchAPI(`/api/amandes/${id}/pay`, { method: 'PUT' });
        loadAmandes();
        loadStats();
    });
};

window.deleteAmande = (id) => {
    showConfirm('Confirmation', 'Supprimer cette amende ?', async () => {
        await fetchAPI(`/api/amandes/${id}`, { method: 'DELETE' });
        loadAmandes();
        loadStats();
    });
};

window.addAmande = async () => {
    const members = await fetchAPI('/api/members');
    showModal('Enregistrer une Amende', `
        <form id="amande-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Membre</label>
                <select id="a-member" class="modal-input">
                    ${members.map(m => `<option value="${m.id}">${m.prenom} ${m.nom}</option>`).join('')}
                </select>
            </div>
            <div class="full-width">
                <label class="input-label">Type d'Amende</label>
                <select id="a-type" class="modal-input">
                    <option value="Réunion">Réunion</option>
                    <option value="Travail">Travail</option>
                    <option value="Indiscipline">Indiscipline / Comportement</option>
                    <option value="Social">Social</option>
                    <option value="Sport">Sport</option>
                    <option value="Gouvernement">Gouvernement</option>
                </select>
            </div>
            <div>
                <label class="input-label">Montant (FG)</label>
                <input type="number" id="a-montant" value="1000" class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Motif</label>
                <input type="text" id="a-motif" placeholder="Ex: Indiscipline" class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Date</label>
                <input type="date" id="a-date" value="${new Date().toISOString().split('T')[0]}" class="modal-input">
            </div>
        </form>
    `, async () => {
        const body = {
            membre_id: document.getElementById('a-member').value,
            type: document.getElementById('a-type').value,
            motif: document.getElementById('a-motif').value,
            montant: parseFloat(document.getElementById('a-montant').value),
            date: document.getElementById('a-date').value
        };
        try {
            await fetchAPI('/api/amandes', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            showToast('Amende enregistrée !', 'success');
            loadAmandes();
            loadStats();
        } catch (err) {
            throw err;
        }
    });
};

function filterTable(term, type) {
    const t = term.toLowerCase();
    if (type === 'members') renderMembers(state.data.members.filter(m => m.nom.toLowerCase().includes(t) || m.prenom.toLowerCase().includes(t)));
    if (type === 'cotisations') renderCotisations(state.data.cotisations.filter(c => c.nom.toLowerCase().includes(t) || c.prenom.toLowerCase().includes(t) || c.mois.toLowerCase().includes(t)));
    if (type === 'expenses') renderExpenses(state.data.expenses.filter(e => e.description.toLowerCase().includes(t) || (e.categorie || '').toLowerCase().includes(t)));
    if (type === 'amandes') renderAmandes(state.data.amandes.filter(a => a.nom.toLowerCase().includes(t) || a.prenom.toLowerCase().includes(t) || a.motif.toLowerCase().includes(t) || a.type.toLowerCase().includes(t)));
    if (type === 'audit') renderAuditLogs(state.data.audit.filter(l => l.user_name.toLowerCase().includes(t) || l.action.toLowerCase().includes(t) || (l.details || '').toLowerCase().includes(t)));
}

async function loadAuditLogs() {
    if (state.user?.role !== 'admin') return;
    const data = await fetchAPI('/api/audit');
    state.data.audit = data;
    renderAuditLogs(data);
}

function renderAuditLogs(items, page = 1) {
    const list = document.getElementById('audit-list');
    const { paginatedItems, totalPages } = paginate(items, page, 'audit');

    list.innerHTML = paginatedItems.map(l => `
        <tr>
            <td data-label="Date">${new Date(l.date).toLocaleString()}</td>
            <td data-label="Admin"><b>${l.user_name}</b></td>
            <td data-label="Action"><span class="badge" style="background:var(--primary)">${l.action}</span></td>
            <td data-label="Détails" style="font-size: 0.8rem; white-space: pre-wrap; word-break: break-all;">${l.details || '-'}</td>
        </tr>
    `).join('');

    renderPaginationControls(document.getElementById('audit-list').parentElement, totalPages, page, 'audit', items);
}

window.clearAuditLogs = () => {
    showConfirm('Attention', 'Voulez-vous vraiment effacer tout l\'historique administrateur ? Cette action est irréversible.', async () => {
        await fetchAPI('/api/audit', { method: 'DELETE' });
        showToast('Historique effacé', 'success');
        loadAuditLogs();
    });
};

// --- Pagination Utility ---
function paginate(items, page, type) {
    state.pagination[type] = page;
    const startIndex = (page - 1) * state.pagination.itemsPerPage;
    const paginatedItems = items.slice(startIndex, startIndex + state.pagination.itemsPerPage);
    const totalPages = Math.ceil(items.length / state.pagination.itemsPerPage);
    return { paginatedItems, totalPages };
}

function renderPaginationControls(container, totalPages, currentPage, type, items) {
    let paginationContainer = container.querySelector('.pagination-controls');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-controls';
        paginationContainer.style = 'display:flex; justify-content:center; gap:5px; margin-top:15px;';
        container.appendChild(paginationContainer);
    }

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let buttonsHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === currentPage;
        buttonsHtml += `<button class="btn-small" style="padding:4px 10px; ${isActive ? 'background:var(--primary);color:white;' : 'background:transparent;color:var(--text);border:1px solid var(--glass-border);'}" onclick="handlePaginationClick('${type}', ${i})">${i}</button>`;
    }
    paginationContainer.innerHTML = buttonsHtml;
}

window.handlePaginationClick = (type, page) => {
    let activeItems = state.data[type];
    const searchTerm = document.getElementById(type === 'cotisations' ? 'cotis-search' : (type === 'expenses' ? 'expense-search' : (type === 'members' ? 'member-search' : (type === 'amandes' ? 'amande-search' : (type === 'audit' ? 'audit-search' : '')))))?.value.toLowerCase();

    if (searchTerm) {
        // Must re-filter before paginating to keep state correct during search
        if (type === 'members') activeItems = state.data.members.filter(m => m.nom.toLowerCase().includes(searchTerm) || m.prenom.toLowerCase().includes(searchTerm));
        if (type === 'cotisations') activeItems = state.data.cotisations.filter(c => c.nom.toLowerCase().includes(searchTerm) || c.prenom.toLowerCase().includes(searchTerm) || c.mois.toLowerCase().includes(searchTerm));
        if (type === 'expenses') activeItems = state.data.expenses.filter(e => e.description.toLowerCase().includes(searchTerm) || (e.categorie || '').toLowerCase().includes(searchTerm));
        if (type === 'amandes') activeItems = state.data.amandes.filter(a => a.nom.toLowerCase().includes(searchTerm) || a.prenom.toLowerCase().includes(searchTerm) || a.motif.toLowerCase().includes(searchTerm) || a.type.toLowerCase().includes(searchTerm));
        if (type === 'audit') activeItems = state.data.audit.filter(l => l.user_name.toLowerCase().includes(searchTerm) || l.action.toLowerCase().includes(searchTerm) || (l.details || '').toLowerCase().includes(searchTerm));
    }

    if (type === 'members') renderMembers(activeItems, page);
    if (type === 'cotisations') renderCotisations(activeItems, page);
    if (type === 'expenses') renderExpenses(activeItems, page);
    if (type === 'meetings') renderMeetings(activeItems, page);
    if (type === 'amandes') renderAmandes(activeItems, page);
    if (type === 'audit') renderAuditLogs(activeItems, page);
};

window.remindWhatsApp = (phone, amount, month) => {
    if (!phone) return showToast('Aucun numéro de téléphone enregistré', 'error');
    const msg = encodeURIComponent(`Rappel U.J.A.D : Solde de ${amount} FG pour ${month} à régulariser. Merci !`);
    window.open(`https://wa.me/${phone.replace(/\s/g, '')}?text=${msg}`, '_blank');
};

// --- Settings & Premium Features ---
async function loadSettings() {
    try {
        const res = await fetch('/api/system/settings');
        if (res.ok) {
            state.settings = await res.json();
            applySettings();
        }
    } catch (err) {
        console.error('Failed to load settings', err);
    }
}

function applySettings() {
    const s = state.settings;
    if (s.assoc_name) {
        document.title = `${s.assoc_name} - Gestion`;
        document.querySelectorAll('.brand h3').forEach(el => el.textContent = s.assoc_name);
        document.querySelector('.auth-card h1').textContent = s.assoc_name;
    }
    if (s.assoc_logo) {
        document.querySelectorAll('.brand img, .auth-card img').forEach(img => img.src = s.assoc_logo);
    }
    
    // Update Reglement Spans
    const currency = s.currency || 'FG';
    const regKeys = [
        'amande_indiscipline', 'amande_bagarre', 
        'amande_retard_reunion', 'amande_chomage_reunion',
        'inscription_tarif', 'cotisation_dimanche',
        'amande_retard_travail', 'amande_chomage_travail'
    ];
    regKeys.forEach(k => {
        const el = document.getElementById(`reg-${k}`);
        if (el && s[k]) {
            el.textContent = `${parseInt(s[k]).toLocaleString()} ${currency}`;
        }
    });
}

function renderSettingsPage() {
    const s = state.settings;
    for (const [key, value] of Object.entries(s)) {
        const input = document.getElementById(`set-${key}`);
        if (input) input.value = value;
    }
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updates = {};
    
    // Manual mapping because FormData/ID sync is easier this way for specific keys
    const keys = [
        'assoc_name', 'assoc_logo', 'currency', 
        'amande_retard_reunion', 'amande_chomage_reunion', 
        'amande_retard_travail', 'amande_chomage_travail',
        'amande_indiscipline', 'amande_bagarre',
        'inscription_tarif', 'cotisation_dimanche'
    ];
    
    keys.forEach(k => {
        const val = document.getElementById(`set-${k}`)?.value;
        if (val !== undefined) updates[k] = val;
    });

    try {
        const res = await fetch('/api/system/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (res.ok) {
            showToast('Paramètres mis à jour avec succès !', 'success');
            await loadSettings();
        } else {
            throw new Error('Erreur lors de la sauvegarde');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function fetchAPI(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (res.status === 401) {
            showScreen('auth');
            return null;
        }
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Erreur API');
        }
        return await res.json();
    } catch (err) {
        showToast(err.message, 'error');
        return null;
    }
}

// --- Action Handlers ---
window.addMember = () => {
    showModal('Ajouter un Membre', `
        <form id="member-form" class="modal-grid">
            <div class="form-group-title">Identité</div>
            <div><label class="input-label">Nom</label><input type="text" id="m-nom" required class="modal-input"></div>
            <div><label class="input-label">Prénom</label><input type="text" id="m-prenom" required class="modal-input"></div>
            <div class="form-group-title">Photo de Profil</div>
            <div class="full-width"><label class="input-label">Choisir une image</label><input type="file" id="m-photo" accept="image/*" class="modal-input" style="padding: 8px;"></div>
            <div class="form-group-title">Coordination</div>
            <div><label class="input-label">Téléphone</label><input type="text" id="m-tel" class="modal-input"></div>
            <div><label class="input-label">Rôle</label><select id="m-role" class="modal-input"><option value="membre">Membre</option><option value="admin">Admin</option></select></div>
            <div>
                <label class="input-label">Inscription (7000 FG)</label>
                <select id="m-ins" class="modal-input">
                    <option value="0">Non payé</option>
                    <option value="1">Déjà payé</option>
                </select>
            </div>
            <div class="full-width"><label class="input-label">Mot de passe</label><input type="password" id="m-pass" class="modal-input"></div>
        </form>
    `, async () => {
        const formData = new FormData();
        formData.append('nom', document.getElementById('m-nom').value);
        formData.append('prenom', document.getElementById('m-prenom').value);
        formData.append('telephone', document.getElementById('m-tel').value);
        formData.append('password', document.getElementById('m-pass').value);
        formData.append('role', document.getElementById('m-role').value);
        formData.append('statut', 'actif');
        formData.append('inscription_payee', parseInt(document.getElementById('m-ins').value) || 0);

        const isPaid = parseInt(document.getElementById('m-ins').value) === 1;
        if (isPaid) formData.append('date_inscription', new Date().toISOString().split('T')[0]);

        const fileInput = document.getElementById('m-photo');
        if (fileInput.files.length > 0) formData.append('photo', fileInput.files[0]);

        try {
            await fetchAPI('/api/members', { method: 'POST', body: formData });
            showToast('Membre ajouté avec succès !', 'success');
            const data = await fetchAPI('/api/members');
            state.data.members = data;
            const searchInput = document.getElementById('member-search');
            if (searchInput) searchInput.value = ''; // Clear search to see new member
            const lastPage = Math.ceil(data.length / state.pagination.itemsPerPage) || 1;
            renderMembers(data, lastPage);
            loadStats();
        } catch (err) {
            throw err; 
        }
    });
};

window.editMember = async (id) => {
    const list = await fetchAPI('/api/members');
    const m = list.find(x => x.id === id);
    showModal('Modifier Membre', `
        <form id="member-form" class="modal-grid">
            <div class="form-group-title">Identité</div>
            <div><label class="input-label">Nom</label><input type="text" id="m-nom" value="${m.nom}" class="modal-input"></div>
            <div><label class="input-label">Prénom</label><input type="text" id="m-prenom" value="${m.prenom}" class="modal-input"></div>
            <div class="form-group-title">Photo de Profil</div>
            <div class="full-width">
                ${m.photo_url ? `<div style="margin-bottom:10px;"><img src="${m.photo_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;"></div>` : ''}
                <label class="input-label">Changer l'image</label><input type="file" id="m-photo" accept="image/*" class="modal-input" style="padding: 8px;">
            </div>
            <div class="form-group-title">Coordination</div>
            <div><label class="input-label">Téléphone</label><input type="text" id="m-tel" value="${m.telephone || ''}" class="modal-input"></div>
            <div><label class="input-label">Statut</label><select id="m-statut" class="modal-input"><option value="actif" ${m.statut === 'actif' ? 'selected' : ''}>Actif</option><option value="inactif" ${m.statut === 'inactif' ? 'selected' : ''}>Inactif</option></select></div>
            <div>
                <label class="input-label">Inscription (7000 FG)</label>
                <select id="m-ins" class="modal-input">
                    <option value="0" ${m.inscription_payee == 0 ? 'selected' : ''}>Non payé</option>
                    <option value="1" ${m.inscription_payee == 1 ? 'selected' : ''}>Payé</option>
                </select>
            </div>
            <div class="full-width"><label class="input-label">Nouveau Mot de Passe (laisser vide pour ne pas changer)</label><input type="password" id="m-pass" class="modal-input" placeholder="••••••••"></div>
        </form>
    `, async () => {
        const formData = new FormData();
        formData.append('nom', document.getElementById('m-nom').value);
        formData.append('prenom', document.getElementById('m-prenom').value);
        formData.append('telephone', document.getElementById('m-tel').value);
        formData.append('statut', document.getElementById('m-statut').value);
        formData.append('inscription_payee', parseInt(document.getElementById('m-ins').value));
        formData.append('role', m.role); // Maintain role 

        const pwd = document.getElementById('m-pass').value;
        if (pwd) formData.append('password', pwd);

        const fileInput = document.getElementById('m-photo');
        if (fileInput.files.length > 0) formData.append('photo', fileInput.files[0]);

        try {
            await fetchAPI(`/api/members/${id}`, { method: 'PUT', body: formData });
            showToast('Membre mis à jour !', 'success');
            loadMembers(state.pagination.members);
            loadStats();
        } catch (err) {
            throw err;
        }
    });
};

window.addCotis = async () => {
    const members = await fetchAPI('/api/members');
    showModal('Enregistrer Paiement', `
        <form id="cotis-form" class="modal-grid">
            <div class="full-width"><label class="input-label">Membre</label><select id="c-member" class="modal-input">${members.map(m => `<option value="${m.id}">${m.prenom} ${m.nom}</option>`).join('')}</select></div>
            <div><label class="input-label">Montant Payé</label><input type="number" id="c-montant" value="5000" class="modal-input"></div>
            <div><label class="input-label">Montant Total Dû</label><input type="number" id="c-total" value="5000" class="modal-input"></div>
            <div><label class="input-label">Mois</label><input type="text" id="c-mois" required class="modal-input"></div>
            <div><label class="input-label">Date</label><input type="date" id="c-date" value="${new Date().toISOString().split('T')[0]}" class="modal-input"></div>
        </form>
    `, async () => {
        const body = { memberId: document.getElementById('c-member').value, montant: parseFloat(document.getElementById('c-montant').value), montantTotal: parseFloat(document.getElementById('c-total').value), mois: document.getElementById('c-mois').value, date: document.getElementById('c-date').value };
        try {
            await fetchAPI('/api/cotis', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            showToast('Paiement enregistré !', 'success');
            loadCotisations();
            loadStats();
        } catch (err) {
            throw err;
        }
    });
};

window.exportPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const stats = await fetchAPI('/api/stats');
    const s = state.settings;
    const currency = s.currency || 'FG';

    // Titre
    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241); // Primary color
    doc.text(`Rapport Financier ${s.assoc_name}`, 20, 20);

    // Informations Générales
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Généré le: ${new Date().toLocaleDateString()}`, 20, 28);

    // Bilan Financier
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text('Bilan Financier Global', 20, 45);

    const financialData = [
        ['Total Recettes Brut', `${(stats.totalFinances + stats.totalAmandes + stats.totalInscriptions).toLocaleString()} ${currency}`],
        ['Total Dépenses', `${stats.totalDepenses.toLocaleString()} ${currency}`],
        ['Reste à Recouvrer', `${stats.totalReste.toLocaleString()} ${currency}`],
        ['Solde Net (En Caisse)', `${stats.soldeNet.toLocaleString()} ${currency}`]
    ];

    doc.autoTable({
        startY: 50,
        head: [['Indicateur', 'Montant']],
        body: financialData,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] }
    });

    // Liste des membres actifs
    const activeMembers = members.filter(m => m.statut === 'actif');
    doc.text('Liste des Membres Actifs', 20, doc.lastAutoTable.finalY + 15);

    const membersData = activeMembers.map(m => [
        `${m.nom} ${m.prenom}`,
        m.telephone || 'N/A',
        m.role
    ]);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Nom & Prénom', 'Téléphone', 'Rôle']],
        body: membersData,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85] }
    });

    doc.save(`Rapport_UJAD_${new Date().toISOString().split('T')[0]}.pdf`);
};

// --- Missing Action Handlers ---
window.addMeeting = () => {
    showModal('Nouvelle Réunion / Activité', `
        <form id="meeting-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Type d'Activité</label>
                <select id="mt-type" class="modal-input">
                    <option value="Réunion">Réunion (Dimanche 20h35)</option>
                    <option value="Travail">Travail (Dimanche 08h35)</option>
                    <option value="Social">Cas Social (09h00)</option>
                    <option value="Sport">Sport (Foot Ball 16h30)</option>
                </select>
            </div>
            <div class="full-width">
                <label class="input-label">Date</label>
                <input type="date" id="mt-date" required class="modal-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="full-width">
                <label class="input-label">Thème / Objet</label>
                <input type="text" id="mt-theme" placeholder="Ex: Discussion règlement" class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Lieu</label>
                <input type="text" id="mt-lieu" placeholder="Lieu de la rencontre" class="modal-input">
            </div>
        </form>
    `, async () => {
        const body = {
            date: document.getElementById('mt-date').value,
            theme: document.getElementById('mt-theme').value,
            lieu: document.getElementById('mt-lieu').value,
            type: document.getElementById('mt-type').value
        };
        try {
            await fetchAPI('/api/meetings', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            showToast('Activité créée !', 'success');
            loadMeetings();
        } catch (err) {
            throw err;
        }
    });
};

window.editMeeting = async (id) => {
    const list = await fetchAPI('/api/meetings');
    const m = list.find(x => x.id === id);
    showModal('Modifier Activité', `
        <form id="meeting-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Type d'Activité</label>
                <select id="mt-type" class="modal-input">
                    <option value="Réunion" ${m.type === 'Réunion' ? 'selected' : ''}>Réunion (Dimanche 20h35)</option>
                    <option value="Travail" ${m.type === 'Travail' ? 'selected' : ''}>Travail (Dimanche 08h35)</option>
                    <option value="Social" ${m.type === 'Social' ? 'selected' : ''}>Cas Social (09h00)</option>
                    <option value="Sport" ${m.type === 'Sport' ? 'selected' : ''}>Sport (Foot Ball 16h30)</option>
                </select>
            </div>
            <div class="full-width">
                <label class="input-label">Date</label>
                <input type="date" id="mt-date" required class="modal-input" value="${m.date}">
            </div>
            <div class="full-width">
                <label class="input-label">Thème / Objet</label>
                <input type="text" id="mt-theme" value="${m.theme || ''}" class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Lieu</label>
                <input type="text" id="mt-lieu" value="${m.lieu || ''}" class="modal-input">
            </div>
        </form>
    `, async () => {
        const body = {
            date: document.getElementById('mt-date').value,
            theme: document.getElementById('mt-theme').value,
            lieu: document.getElementById('mt-lieu').value,
            type: document.getElementById('mt-type').value
        };
        try {
            await fetchAPI(`/api/meetings/${id}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            showToast('Activité mise à jour !', 'success');
            loadMeetings();
        } catch (err) {
            throw err;
        }
    });
};

window.deleteMeeting = (id) => {
    showConfirm('Confirmation', 'Supprimer cette réunion et toutes les présences associées ?', async () => {
        await fetchAPI(`/api/meetings/${id}`, { method: 'DELETE' });
        loadMeetings();
    });
};

window.addExpense = () => {
    showModal('Enregistrer une Dépense', `
        <form id="expense-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Description</label>
                <input type="text" id="ex-desc" placeholder="Ex: Achat eau" required class="modal-input">
            </div>
            <div>
                <label class="input-label">Montant (FG)</label>
                <input type="number" id="ex-montant" required class="modal-input">
            </div>
            <div>
                <label class="input-label">Date</label>
                <input type="date" id="ex-date" value="${new Date().toISOString().split('T')[0]}" required class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Catégorie</label>
                <select id="ex-categorie" class="modal-input">
                    <option value="">-- Aucune --</option>
                    <option value="Alimentation">Alimentation</option>
                    <option value="Transport">Transport</option>
                    <option value="Matériel">Matériel</option>
                    <option value="Entretien">Entretien</option>
                    <option value="Social">Social</option>
                    <option value="Sport">Sport</option>
                    <option value="Autre">Autre</option>
                </select>
            </div>
            <div class="full-width">
                <label class="input-label">Justificatif (Photo de reçu)</label>
                <input type="file" id="ex-photo" accept="image/*" class="modal-input" style="padding: 8px;">
            </div>
        </form>
    `, async () => {
        const formData = new FormData();
        formData.append('description', document.getElementById('ex-desc').value);
        formData.append('montant', document.getElementById('ex-montant').value);
        formData.append('date', document.getElementById('ex-date').value);
        formData.append('categorie', document.getElementById('ex-categorie').value);
        
        const fileInput = document.getElementById('ex-photo');
        if (fileInput.files.length > 0) formData.append('receipt', fileInput.files[0]);

        try {
            await fetchAPI('/api/expenses', { method: 'POST', body: formData });
            showToast('Dépense enregistrée !', 'success');
            loadExpenses();
            loadStats();
        } catch (err) {
            throw err;
        }
    });
};

window.deleteExpense = (id) => {
    showConfirm('Confirmation', 'Supprimer cette dépense ?', async () => {
        await fetchAPI(`/api/expenses/${id}`, { method: 'DELETE' });
        loadExpenses();
        loadStats();
    });
};

window.editExpense = async (id) => {
    const list = await fetchAPI('/api/expenses');
    const e = list.find(x => x.id === id);
    if (!e) return;
    showModal('Modifier Dépense', `
        <form id="expense-edit-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Description</label>
                <input type="text" id="ex-desc" value="${e.description}" required class="modal-input">
            </div>
            <div>
                <label class="input-label">Montant (FG)</label>
                <input type="number" id="ex-montant" value="${e.montant}" required class="modal-input">
            </div>
            <div>
                <label class="input-label">Date</label>
                <input type="date" id="ex-date" value="${e.date}" required class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Catégorie</label>
                <select id="ex-categorie" class="modal-input">
                    <option value="">-- Aucune --</option>
                    <option value="Alimentation" ${e.categorie === 'Alimentation' ? 'selected' : ''}>Alimentation</option>
                    <option value="Transport" ${e.categorie === 'Transport' ? 'selected' : ''}>Transport</option>
                    <option value="Matériel" ${e.categorie === 'Matériel' ? 'selected' : ''}>Matériel</option>
                    <option value="Entretien" ${e.categorie === 'Entretien' ? 'selected' : ''}>Entretien</option>
                    <option value="Social" ${e.categorie === 'Social' ? 'selected' : ''}>Social</option>
                    <option value="Sport" ${e.categorie === 'Sport' ? 'selected' : ''}>Sport</option>
                    <option value="Autre" ${e.categorie === 'Autre' ? 'selected' : ''}>Autre</option>
                </select>
            </div>
            <div class="full-width">
                ${e.receipt_url ? `<div style="margin-bottom:10px;"><img src="${e.receipt_url}" style="width:50px;height:50px;border-radius:8px;object-fit:cover;"></div>` : ''}
                <label class="input-label">Changer le justificatif</label>
                <input type="file" id="ex-photo" accept="image/*" class="modal-input" style="padding: 8px;">
            </div>
        </form>
    `, async () => {
        const formData = new FormData();
        formData.append('description', document.getElementById('ex-desc').value);
        formData.append('montant', document.getElementById('ex-montant').value);
        formData.append('date', document.getElementById('ex-date').value);
        formData.append('categorie', document.getElementById('ex-categorie').value);
        
        const fileInput = document.getElementById('ex-photo');
        if (fileInput.files.length > 0) formData.append('receipt', fileInput.files[0]);

        try {
            await fetchAPI(`/api/expenses/${id}`, { method: 'PUT', body: formData });
            showToast('Dépense mise à jour !', 'success');
            loadExpenses();
            loadStats();
        } catch (err) {
            throw err;
        }
    });
};

// --- Announcements Logic ---
async function loadAnnouncements() {
    const data = await fetchAPI('/api/announcements');
    renderAnnouncements(data);
}

function renderAnnouncements(items) {
    const list = document.getElementById('announcements-list');
    const isAdmin = state.user?.role === 'admin';

    if (items.length === 0) {
        list.innerHTML = '<p style="color: var(--text-dim); font-size: 0.9rem;">Aucune annonce pour le moment.</p>';
        return;
    }

    list.innerHTML = items.map(a => `
        <div class="glass" style="padding: 15px; border-left: 4px solid ${a.importance === 'alert' ? '#f87171' : (a.importance === 'success' ? '#4ade80' : '#6366f1')}; position: relative;">
            <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 5px;">${a.date}</div>
            <h4 style="margin: 0 0 8px 0; color: white;">${a.titre}</h4>
            <p style="margin: 0; color: var(--text-dim); font-size: 0.95rem; line-height: 1.4;">${a.contenu}</p>
            ${isAdmin ? `<button onclick="deleteAnnouncement(${a.id})" class="btn-small btn-danger" style="position: absolute; top: 10px; right: 10px; padding: 2px 6px; font-size: 0.7rem;">Suppr</button>` : ''}
        </div>
    `).join('');
}

window.showAddAnnouncementModal = () => {
    showModal('Nouvelle Annonce', `
        <form id="announcement-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Titre</label>
                <input type="text" id="ann-titre" placeholder="Ex: Annulation Réunion" required class="modal-input">
            </div>
            <div class="full-width">
                <label class="input-label">Contenu du Message</label>
                <textarea id="ann-contenu" class="modal-input" style="height: 100px; resize: none;" placeholder="Entrez votre message ici..."></textarea>
            </div>
            <div>
                <label class="input-label">Niveau d'Importance</label>
                <select id="ann-imp" class="modal-input">
                    <option value="info">Information (Bleu)</option>
                    <option value="alert">Alerte / Urgent (Rouge)</option>
                    <option value="success">Succès / Bonne Nouvelle (Vert)</option>
                </select>
            </div>
            <div>
                <label class="input-label">Date</label>
                <input type="date" id="ann-date" value="${new Date().toISOString().split('T')[0]}" class="modal-input">
            </div>
        </form>
    `, async () => {
        const body = {
            titre: document.getElementById('ann-titre').value,
            contenu: document.getElementById('ann-contenu').value,
            importance: document.getElementById('ann-imp').value,
            date: document.getElementById('ann-date').value
        };
        try {
            await fetchAPI('/api/announcements', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            showToast('Annonce publiée !', 'success');
            loadAnnouncements();
        } catch (err) {
            throw err;
        }
    });
};

window.deleteAnnouncement = (id) => {
    showConfirm('Confirmation', 'Supprimer cette annonce ?', async () => {
        await fetchAPI(`/api/announcements/${id}`, { method: 'DELETE' });
        loadAnnouncements();
    });
};

window.deleteMember = (id) => {
    showConfirm('Confirmation', 'Supprimer ce membre définitivement ?', async () => {
        await fetchAPI(`/api/members/${id}`, { method: 'DELETE' });
        loadMembers();
    });
};

window.editCotis = async (id) => {
    const list = await fetchAPI('/api/cotis');
    const c = list.find(x => x.id === id);
    const members = await fetchAPI('/api/members');
    showModal('Modifier Paiement', `
        <form id="cotis-form" class="modal-grid">
            <div class="full-width">
                <label class="input-label">Membre</label>
                <select id="c-member" class="modal-input">
                    ${members.map(m => `<option value="${m.id}" ${m.id === c.membre_id ? 'selected' : ''}>${m.prenom} ${m.nom}</option>`).join('')}
                </select>
            </div>
            <div><label class="input-label">Montant Payé</label><input type="number" id="c-montant" value="${c.montant}" class="modal-input"></div>
            <div><label class="input-label">Montant Dû</label><input type="number" id="c-total" value="${c.montant_total || c.montant}" class="modal-input"></div>
        </form>
    `, async () => {
        const body = { memberId: document.getElementById('c-member').value, montant: parseFloat(document.getElementById('c-montant').value), montantTotal: parseFloat(document.getElementById('c-total').value), mois: c.mois, date: c.date_paiement };
        try {
            await fetchAPI(`/api/cotis/${id}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            showToast('Paiement mis à jour !', 'success');
            loadCotisations();
            loadStats();
        } catch (err) {
            throw err;
        }
    });
};

// --- Export CSV Logic ---
window.exportTableToCSV = (tbodyId, filename) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    // Find the corresponding thead for this tbody by traversing up to the table
    const table = tbody.closest('table');
    const thead = table.querySelector('thead');

    let csv = [];

    // Extract headers
    if (thead) {
        let headers = [];
        thead.querySelectorAll('th').forEach(th => {
            if (th.innerText.toLowerCase() !== 'actions') {
                headers.push('"' + th.innerText.replace(/"/g, '""') + '"');
            }
        });
        csv.push(headers.join(','));
    }

    // Extract rows
    tbody.querySelectorAll('tr').forEach(tr => {
        let row = [];
        tr.querySelectorAll('td').forEach((td, index, list) => {
            // Ignore the last column if it's Actions (simplified check)
            if (index < list.length - 1 || td.querySelector('.btn-small') === null) {
                row.push('"' + td.innerText.replace(/"/g, '""') + '"');
            }
        });
        if (row.length > 0) csv.push(row.join(','));
    });

    // Download CSV
    const csvFile = new Blob(["\uFEFF" + csv.join('\n')], { type: "text/csv;charset=utf-8;" });
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    showToast('Export CSV réussi', 'success');
};

window.generateReceiptPDF = (type, memberName, amount, details, date) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Theme Colors
    const primary = [99, 102, 241];
    const textMain = [40, 40, 40];
    const textDim = [100, 100, 100];

    const s = state.settings;
    const currency = s.currency || 'FG';

    // Header structure
    doc.setFillColor(...primary);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(s.assoc_name, 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Reçu de Paiement Officiel', 105, 30, { align: 'center' });

    // Title
    doc.setTextColor(...textMain);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('REÇU DE PAIEMENT', 105, 60, { align: 'center' });

    // Receipt Info Box
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.5);
    doc.line(20, 70, 190, 70);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    doc.text('Date du reçu :', 20, 85);
    doc.text(date, 80, 85);

    doc.text('Reçu de :', 20, 95);
    doc.setFont('helvetica', 'bold');
    doc.text(memberName, 80, 95);

    doc.setFont('helvetica', 'normal');
    doc.text('Montant payé :', 20, 115);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 167, 69); // Green 
    doc.text(`${amount.toLocaleString()} ${currency}`, 80, 115);

    doc.setTextColor(...textMain);
    doc.setFont('helvetica', 'normal');
    doc.text('Motif :', 20, 125);
    doc.text(type === 'cotisation' ? `Cotisation mensuelle (${details})` : `Paiement Amande (${details})`, 80, 125);

    doc.line(20, 140, 190, 140);

    // Footer validation
    doc.setFontSize(10);
    doc.setTextColor(...textDim);
    doc.setFont('helvetica', 'italic');
    doc.text('Ce recu est genere automatiquement par le systeme de gestion.', 105, 160, { align: 'center' });
    doc.text('La Tresorerie', 170, 180, { align: 'center' });

    // Signature Line
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    doc.line(150, 200, 190, 200);

    // Save
    doc.save(`Recu_${memberName.replace(/\s+/g, '_')}_${date}.pdf`);
};
