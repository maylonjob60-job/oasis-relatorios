const API = 'http://localhost:3000/api';

// ── Estado ──
let currentView = 'dashboard';
let editingId   = null;
let editingType = null;
let clientes    = [];
let relatorios  = [];

// ── Navegação ──
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    navegar(view);
  });
});

document.getElementById('btn-novo').addEventListener('click', () => {
  if (currentView === 'clientes')   abrirModalCliente();
  if (currentView === 'relatorios') abrirModalRelatorio();
  if (currentView === 'dashboard')  abrirModalRelatorio();
});

function navegar(view) {
  currentView = view;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  document.getElementById('topbar-title').textContent =
    view === 'dashboard' ? 'Dashboard' : view === 'relatorios' ? 'Relatórios' : 'Clientes';
  if (view === 'dashboard')  carregarDashboard();
  if (view === 'relatorios') carregarRelatorios();
  if (view === 'clientes')   carregarClientes();
}

// ── API helpers ──
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + url, opts);
  return res.json();
}

// ── Dashboard ──
async function carregarDashboard() {
  [relatorios, clientes] = await Promise.all([api('GET', '/relatorios'), api('GET', '/clientes')]);
  document.getElementById('stat-relatorios').textContent = relatorios.length;
  document.getElementById('stat-clientes').textContent   = clientes.length;
  document.getElementById('stat-pendentes').textContent  = relatorios.filter(r => r.status === 'pendente').length;
  document.getElementById('stat-concluidos').textContent = relatorios.filter(r => r.status === 'concluido').length;

  const tbody = document.getElementById('tbody-recentes');
  const recentes = relatorios.slice(0, 8);
  tbody.innerHTML = recentes.length
    ? recentes.map(r => `
        <tr>
          <td>${r.titulo}</td>
          <td>${r.cliente_nome || '—'}</td>
          <td>${badge(r.status)}</td>
          <td>${dataFormatada(r.criado_em)}</td>
          <td><button class="btn-icon" onclick="baixarPdf(${r.id})" title="Gerar PDF">⬇</button></td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty">Nenhum relatório ainda.</td></tr>`;
}

// ── Relatórios ──
async function carregarRelatorios() {
  relatorios = await api('GET', '/relatorios');
  clientes   = await api('GET', '/clientes');
  const tbody = document.getElementById('tbody-relatorios');
  tbody.innerHTML = relatorios.length
    ? relatorios.map(r => `
        <tr>
          <td>#${r.id}</td>
          <td>${r.titulo}</td>
          <td>${r.cliente_nome || '—'}</td>
          <td>${r.valor ? 'R$ ' + Number(r.valor).toFixed(2) : '—'}</td>
          <td>${badge(r.status)}</td>
          <td>${dataFormatada(r.criado_em)}</td>
          <td class="actions">
            <button class="btn-icon" onclick="editarRelatorio(${r.id})" title="Editar">✎</button>
            <button class="btn-icon" onclick="baixarPdf(${r.id})" title="PDF">⬇</button>
            <button class="btn-icon danger" onclick="excluirRelatorio(${r.id})" title="Excluir">✕</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7" class="empty">Nenhum relatório cadastrado.</td></tr>`;
}

async function editarRelatorio(id) {
  clientes = await api('GET', '/clientes');
  const rel = relatorios.find(r => r.id === id);
  abrirModalRelatorio(rel);
}

async function excluirRelatorio(id) {
  if (!confirm('Excluir este relatório?')) return;
  await api('DELETE', `/relatorios/${id}`);
  toast('Relatório excluído.', 'ok');
  carregarRelatorios();
}

async function baixarPdf(id) {
  window.open(`${API}/relatorios/${id}/pdf`, '_blank');
}

// ── Clientes ──
async function carregarClientes() {
  clientes = await api('GET', '/clientes');
  const tbody = document.getElementById('tbody-clientes');
  tbody.innerHTML = clientes.length
    ? clientes.map(c => `
        <tr>
          <td>#${c.id}</td>
          <td>${c.nome}</td>
          <td>${c.email || '—'}</td>
          <td>${c.telefone || '—'}</td>
          <td>${dataFormatada(c.criado_em)}</td>
          <td class="actions">
            <button class="btn-icon" onclick="editarCliente(${c.id})" title="Editar">✎</button>
            <button class="btn-icon danger" onclick="excluirCliente(${c.id})" title="Excluir">✕</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="empty">Nenhum cliente cadastrado.</td></tr>`;
}

function editarCliente(id) {
  const cli = clientes.find(c => c.id === id);
  abrirModalCliente(cli);
}

async function excluirCliente(id) {
  if (!confirm('Excluir este cliente?')) return;
  await api('DELETE', `/clientes/${id}`);
  toast('Cliente excluído.', 'ok');
  carregarClientes();
}

// ── Modal Relatório ──
function abrirModalRelatorio(rel) {
  editingId   = rel ? rel.id : null;
  editingType = 'relatorio';
  document.getElementById('modal-title').textContent = rel ? 'Editar Relatório' : 'Novo Relatório';

  const optsClientes = clientes.map(c =>
    `<option value="${c.id}" ${rel && rel.cliente_id === c.id ? 'selected' : ''}>${c.nome}</option>`
  ).join('');

  const optsStatus = ['pendente','concluido','cancelado'].map(s =>
    `<option value="${s}" ${rel && rel.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
  ).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="field">
      <label>Título *</label>
      <input id="f-titulo" type="text" value="${rel ? rel.titulo : ''}" placeholder="Título do relatório" />
    </div>
    <div class="field">
      <label>Cliente</label>
      <select id="f-cliente">
        <option value="">— Sem cliente —</option>
        ${optsClientes}
      </select>
    </div>
    <div class="field">
      <label>Valor (R$)</label>
      <input id="f-valor" type="number" step="0.01" min="0" value="${rel ? rel.valor || '' : ''}" placeholder="0,00" />
    </div>
    <div class="field">
      <label>Status</label>
      <select id="f-status">${optsStatus}</select>
    </div>
    <div class="field">
      <label>Descrição</label>
      <textarea id="f-descricao" placeholder="Detalhes do relatório...">${rel ? rel.descricao || '' : ''}</textarea>
    </div>
  `;
  abrirModal();
}

// ── Modal Cliente ──
function abrirModalCliente(cli) {
  editingId   = cli ? cli.id : null;
  editingType = 'cliente';
  document.getElementById('modal-title').textContent = cli ? 'Editar Cliente' : 'Novo Cliente';
  document.getElementById('modal-body').innerHTML = `
    <div class="field">
      <label>Nome *</label>
      <input id="f-nome" type="text" value="${cli ? cli.nome : ''}" placeholder="Nome completo" />
    </div>
    <div class="field">
      <label>E-mail</label>
      <input id="f-email" type="email" value="${cli ? cli.email || '' : ''}" placeholder="email@exemplo.com" />
    </div>
    <div class="field">
      <label>Telefone</label>
      <input id="f-telefone" type="text" value="${cli ? cli.telefone || '' : ''}" placeholder="(00) 00000-0000" />
    </div>
    <div class="field">
      <label>Endereço</label>
      <input id="f-endereco" type="text" value="${cli ? cli.endereco || '' : ''}" placeholder="Rua, número, cidade..." />
    </div>
  `;
  abrirModal();
}

// ── Modal geral ──
function abrirModal() {
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.querySelector('#modal-body input, #modal-body textarea')?.focus(), 50);
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = editingType = null;
}

document.getElementById('modal-close').addEventListener('click', fecharModal);
document.getElementById('btn-cancelar').addEventListener('click', fecharModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) fecharModal();
});

document.getElementById('btn-salvar').addEventListener('click', async () => {
  if (editingType === 'relatorio') await salvarRelatorio();
  if (editingType === 'cliente')   await salvarCliente();
});

async function salvarRelatorio() {
  const titulo   = document.getElementById('f-titulo').value.trim();
  const cliente  = document.getElementById('f-cliente').value;
  const valor    = document.getElementById('f-valor').value;
  const status   = document.getElementById('f-status').value;
  const descricao = document.getElementById('f-descricao').value.trim();
  if (!titulo) { toast('Informe o título.', 'err'); return; }

  const body = { titulo, cliente_id: cliente || null, valor: valor || 0, status, descricao };
  if (editingId) {
    await api('PUT', `/relatorios/${editingId}`, body);
    toast('Relatório atualizado!', 'ok');
  } else {
    await api('POST', '/relatorios', body);
    toast('Relatório criado!', 'ok');
  }
  fecharModal();
  if (currentView === 'relatorios') carregarRelatorios();
  else carregarDashboard();
}

async function salvarCliente() {
  const nome     = document.getElementById('f-nome').value.trim();
  const email    = document.getElementById('f-email').value.trim();
  const telefone = document.getElementById('f-telefone').value.trim();
  const endereco = document.getElementById('f-endereco').value.trim();
  if (!nome) { toast('Informe o nome.', 'err'); return; }

  const body = { nome, email, telefone, endereco };
  if (editingId) {
    await api('PUT', `/clientes/${editingId}`, body);
    toast('Cliente atualizado!', 'ok');
  } else {
    await api('POST', '/clientes', body);
    toast('Cliente criado!', 'ok');
  }
  fecharModal();
  carregarClientes();
}

// ── Utilitários ──
function badge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

function dataFormatada(str) {
  if (!str) return '—';
  return str.split('T')[0].split('-').reverse().join('/') || str;
}

let toastTimer;
function toast(msg, tipo) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${tipo || ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Inicializa ──
navegar('dashboard');
