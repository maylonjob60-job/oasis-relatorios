const express      = require('express');
const router       = express.Router();
const PDFDocument  = require('pdfkit');
const { supabase } = require('../db/database');

const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TRAINERS = [
  { key: 'diego',    nome: 'Betão'    },
  { key: 'luiz',     nome: 'Luiz'     },
  { key: 'vinicius', nome: 'Vinícius' },
  { key: 'arthur',   nome: 'Arthur'   },
  { key: 'caio',     nome: 'Caio'     },
  { key: 'lucas',    nome: 'Lucas'    },
  { key: 'michele',  nome: 'Michele'  },
  { key: 'n3',       nome: 'N3 (sozinho/personal)' },
];

// agg 'sum'   → soma das semanas (src: campo semanal usado na soma; padrão = o próprio campo)
// agg 'range' → menor / maior valor do mês (base de alunos)
const ROWS_C = [
  { label: 'Leads na Semana',   f: 'leads_semana',             agg: 'sum' },
  { label: 'Leads no Mês',      f: 'leads_mes',                agg: 'sum', src: 'leads_semana' },
  { label: 'Alunos Ativos',     f: 'alunos_ativos',            agg: 'range', bold: true },
  { label: 'Plano Anual',       f: 'alunos_anual',             agg: 'range' },
  { label: 'Plano Semestral',   f: 'alunos_semestral',         agg: 'range' },
  { label: 'Mensal Recorrente', f: 'alunos_mensal_recorrente', agg: 'range' },
  { label: 'Mensal Comum',      f: 'alunos_mensal_comum',      agg: 'range' },
  { label: 'Natação',           f: 'alunos_natacao',           agg: 'range' },
  { label: 'Alunos Bloqueados', f: 'alunos_bloqueados',        agg: 'range' },
  { label: 'Alunos Suspensos',  f: 'alunos_suspensos',         agg: 'range' },
  { label: 'Evasão na Semana',  f: 'evasao_semana',            agg: 'sum' },
  { label: 'Evasão no Mês',     f: 'evasao_mes',               agg: 'sum', src: 'evasao_semana' },
  { label: 'Novos na Semana',   f: 'alunos_novos_semana',      agg: 'sum' },
  { label: 'Novos no Mês',      f: 'alunos_novos_mes',         agg: 'sum', src: 'alunos_novos_semana' },
];

const ROWS_T = [
  { label: 'Revisões de Treinos',   f: 'revisoes_treinos',            agg: 'sum' },
  { label: 'Novas Avaliações',      f: 'novas_avaliacoes',            agg: 'sum' },
  { label: 'Treinos Vencidos',      f: 'treinos_vencidos',            agg: 'range', zeroValido: true },
  { label: 'Vencendo em 7 dias',    f: 'treinos_vencendo_7dias',      agg: 'range', zeroValido: true },
  { label: 'Alunos em Experiência', f: 'alunos_experiencia',          agg: 'sum' },
  { label: 'Fecharam Experiência',  f: 'alunos_fecharam_experiencia', agg: 'sum' },
  { label: 'Conversão Exp. (%)',    f: 'conversao_experiencia',       agg: 'conv', dec: 1 },
  { label: 'Consultoria Física',    f: 'consultoria_fisica',          agg: 'sum' },
  { label: 'Total Encarteirados',   f: 'total_encarteirados',         agg: 'range', bold: true },
  ...TRAINERS.map(tr => ({ label: `     • ${tr.nome}`, f: `encarteirados_${tr.key}`, agg: 'range' })),
];

// ── Calendário: semanas de segunda a domingo (ISO 8601) ─────────────────────
const DIA = 864e5;

function segundaDaSemana(ano, semana) {
  const jan4 = Date.UTC(ano, 0, 4);
  const dow  = new Date(jan4).getUTCDay() || 7;
  return new Date(jan4 - (dow - 1) * DIA + (semana - 1) * 7 * DIA);
}

function semanaIso(data) {
  const d   = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const ano = d.getUTCFullYear();
  return { ano, semana: Math.ceil(((d - Date.UTC(ano, 0, 1)) / DIA + 1) / 7) };
}

// Todas as semanas que tocam o mês, inclusive as que começam no mês anterior
// ou terminam no seguinte.
function semanasDoMes(ano, mes) {
  const inicio = Date.UTC(ano, mes - 1, 1);
  const fim    = Date.UTC(ano, mes, 0);
  const dow    = new Date(inicio).getUTCDay() || 7;
  const lista  = [];
  for (let seg = inicio - (dow - 1) * DIA; seg <= fim; seg += 7 * DIA) {
    const { ano: a, semana } = semanaIso(new Date(seg));
    lista.push({ chave: `${a}-${semana}`, semana, seg: new Date(seg), dom: new Date(seg + 6 * DIA) });
  }
  return lista;
}

function chaveDoRegistro(r) {
  const { ano, semana } = semanaIso(segundaDaSemana(r.ano, r.semana));
  return `${ano}-${semana}`;
}

// Mapa semana → registro (se houver dois para a mesma semana, vale o mais recente)
function indexarPorSemana(registros) {
  const mapa = new Map();
  registros.forEach(r => {
    const k = chaveDoRegistro(r);
    if (!mapa.has(k) || mapa.get(k).id < r.id) mapa.set(k, r);
  });
  return mapa;
}

function registroVazio(r, rows) {
  return rows.every(row => !Number(r[row.f]));
}

function agregarMes(registros, rows) {
  const validos = registros.filter(r => !registroVazio(r, rows));
  if (!validos.length) return null;
  const out = {};
  rows.forEach(row => {
    if (row.agg === 'sum') {
      const campo = row.src || row.f;
      out[row.f] = validos.reduce((acc, r) => acc + (Number(r[campo]) || 0), 0);
    } else if (row.agg === 'range') {
      let vals = validos.map(r => r[row.f]).filter(v => v != null).map(Number);
      // Zero em campo de base de alunos = semana anterior à criação do campo (não preenchido)
      if (!row.zeroValido && vals.some(v => v > 0)) vals = vals.filter(v => v > 0);
      if (!vals.length) { out[row.f] = null; return; }
      const min = Math.min(...vals), max = Math.max(...vals);
      out[row.f] = min === max ? String(min) : `${min} / ${max}`;
    }
  });
  if (rows === ROWS_T) {
    const exp = out.alunos_experiencia, fech = out.alunos_fecharam_experiencia;
    out.conversao_experiencia = exp > 0 ? (fech / exp) * 100 : 0;
  }
  return out;
}

function fmt(v, dec = 0) {
  if (v == null) return '—';
  if (typeof v === 'string' && v.includes('/')) return v;
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return dec > 0 ? n.toFixed(dec) : String(n);
}

const ddmm = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

router.post('/gerar-pdf', async (req, res) => {
  const { tipo = 'completo', mes, ano } = req.body;
  const mesNum = parseInt(mes);
  const anoNum = parseInt(ano);

  if (!mesNum || !anoNum || mesNum < 1 || mesNum > 12)
    return res.status(400).json({ erro: 'Informe mes e ano.' });
  if (!['completo', 'comercial', 'tecnico'].includes(tipo))
    return res.status(400).json({ erro: 'tipo inválido.' });

  let mesPrev = mesNum - 1, anoPrev = anoNum;
  if (mesPrev < 1) { mesPrev = 12; anoPrev--; }

  try {
    const [{ data: todosC, error: e1 }, { data: todosT, error: e2 }] = await Promise.all([
      supabase.from('comercial').select('*').gte('ano', anoPrev - 1).lte('ano', anoNum + 1),
      supabase.from('tecnico').select('*').gte('ano', anoPrev - 1).lte('ano', anoNum + 1),
    ]);
    if (e1 || e2) throw new Error((e1 || e2).message);

    const mapaC = indexarPorSemana(todosC || []);
    const mapaT = indexarPorSemana(todosT || []);

    const semanasAtual = semanasDoMes(anoNum, mesNum);
    const semanasPrev  = semanasDoMes(anoPrev, mesPrev);
    const numCols      = semanasAtual.length;

    const semsC  = semanasAtual.map(s => mapaC.get(s.chave) || null);
    const semsT  = semanasAtual.map(s => mapaT.get(s.chave) || null);
    const prevC  = agregarMes(semanasPrev.map(s => mapaC.get(s.chave)).filter(Boolean), ROWS_C);
    const prevT  = agregarMes(semanasPrev.map(s => mapaT.get(s.chave)).filter(Boolean), ROWS_T);

    const renderC = (tipo === 'completo' || tipo === 'comercial') && (semsC.some(Boolean) || prevC);
    const renderT = (tipo === 'completo' || tipo === 'tecnico')   && (semsT.some(Boolean) || prevT);
    if (!renderC && !renderT)
      return res.status(404).json({ erro: 'Não há dados para este mês nem para o mês anterior.' });

    const mesNome     = MESES[mesNum];
    const mesPrevNome = MESES[mesPrev];
    const now         = new Date();
    const dataStr     = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaStr     = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const nomeArq     = `oasis_${anoNum}${String(mesNum).padStart(2, '0')}_${tipo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}"`);

    // ── Dimensões ─────────────────────────────────────────────────────────────
    const PW  = 841.89;
    const PH  = 595.28;
    const MAR = 38;
    const W   = PW - MAR * 2;

    const GOLD  = '#F5C400';
    const DARK  = '#1a1a1a';
    const CINZA = '#444444';

    const FOOTER_H    = 22;
    const CONTENT_TOP = 69;
    const NOTE_H      = 16;
    const CONTENT_H   = PH - CONTENT_TOP - FOOTER_H - NOTE_H;
    const TITLE_H     = 22;
    const HEAD_H      = 30;

    const COL_LABEL = 150;
    const COL_PREV  = 86;
    const COL_SEM   = Math.floor((W - COL_LABEL - COL_PREV) / numCols);

    const calcRowH = n => Math.min(24, Math.max(16, Math.floor((CONTENT_H - TITLE_H - HEAD_H) / n)));

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.pipe(res);

    // Texto em coordenada fixa sem avançar o cursor (evita páginas em branco)
    function t(str, x, y, opts = {}) {
      const savedY = doc.y;
      doc.text(String(str), x, y, { lineBreak: false, ...opts });
      doc.y = savedY;
    }

    function drawHeader(labelTipo) {
      doc.rect(0, 0, PW, PH).fill('#fafafa');
      doc.rect(0, 0, PW, 56).fill(DARK);
      doc.rect(0, 56, PW, 3).fill(GOLD);

      doc.rect(MAR, 9, 38, 38).fill(GOLD);
      doc.fillColor(DARK).fontSize(17).font('Helvetica-Bold');
      t('O', MAR + 8, 18);

      doc.fillColor(GOLD).fontSize(19).font('Helvetica-Bold');
      t('OÁSIS', MAR + 48, 12);
      doc.fillColor('#cccccc').fontSize(9.5).font('Helvetica');
      t('Centro de Treinamento & Saúde', MAR + 48, 32);

      doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold');
      t(labelTipo, 0, 12, { width: PW - MAR, align: 'right' });
      doc.fillColor('#aaaaaa').fontSize(9).font('Helvetica');
      t(`${mesNome} de ${anoNum}`, 0, 28, { width: PW - MAR, align: 'right' });
      doc.fillColor('#666666').fontSize(7.5);
      t(`Gerado em ${dataStr} às ${horaStr}`, 0, 42, { width: PW - MAR, align: 'right' });
    }

    function drawFooter(pageNum, totalPages) {
      const ny = PH - FOOTER_H - NOTE_H + 3;
      doc.fillColor('#888888').fontSize(6.5).font('Helvetica');
      t(`Coluna ${mesPrevNome}: indicadores semanais somados (semana = mês) · base de alunos e encarteirados como menor / maior do mês · ` +
        'semanas de segunda a domingo; semanas que cruzam a virada do mês entram nos dois meses.',
        MAR, ny, { width: W });

      const fy = PH - FOOTER_H;
      doc.rect(0, fy, PW, FOOTER_H).fill('#f0f0f0');
      doc.rect(0, fy, PW, 1).fill('#cccccc');
      doc.fillColor('#888888').fontSize(7.5).font('Helvetica');
      t(`Oásis Centro de Treinamento & Saúde  ·  ${mesNome} / ${anoNum}  ·  ${dataStr} às ${horaStr}`,
        MAR, fy + 7, { width: PW - MAR * 2 - 60 });
      doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold');
      t(`Pág. ${pageNum} / ${totalPages}`, 0, fy + 7, { width: PW - MAR, align: 'right' });
    }

    function drawTableHeader(y) {
      doc.rect(MAR, y, W, HEAD_H).fill('#1e1e1e');
      doc.fillColor(GOLD).fontSize(7).font('Helvetica-Bold');
      t('INDICADOR', MAR + 5, y + HEAD_H / 2 - 3, { width: COL_LABEL - 10 });

      let x = MAR + COL_LABEL;
      doc.rect(x, y, COL_PREV, HEAD_H).fill('#2a2a2a');
      doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold');
      t(mesPrevNome.toUpperCase(), x + 3, y + 6, { width: COL_PREV - 6, align: 'center' });
      doc.fillColor('#888888').fontSize(6).font('Helvetica');
      t('TOTAL DO MÊS', x + 3, y + 18, { width: COL_PREV - 6, align: 'center' });

      x += COL_PREV;
      semanasAtual.forEach((s, i) => {
        doc.rect(x, y, COL_SEM, HEAD_H).fill(i % 2 === 0 ? '#1b3520' : '#172e1c');
        doc.fillColor('#5ddd90').fontSize(10).font('Helvetica-Bold');
        t(`S${s.semana}`, x + 2, y + 5, { width: COL_SEM - 4, align: 'center' });
        doc.fillColor('#8fbf9f').fontSize(6.5).font('Helvetica');
        t(`${ddmm(s.seg)} a ${ddmm(s.dom)}`, x + 2, y + 19, { width: COL_SEM - 4, align: 'center' });
        x += COL_SEM;
      });
    }

    function drawDataRow(y, row, prevVal, semVals, rowH, odd) {
      const { bold = false, dec = 0 } = row;
      const textY = y + rowH / 2 - 4;
      const fs = bold ? 8.5 : 8;

      doc.rect(MAR, y, W, rowH).fill(bold ? '#fffbe6' : (odd ? '#f4f4f4' : '#ffffff'));
      doc.rect(MAR, y + rowH - 1, W, 1).fill('#e0e0e0');

      doc.fillColor(bold ? '#111100' : '#333333').fontSize(fs).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      t(row.label, MAR + 5, textY, { width: COL_LABEL - 10 });

      let x = MAR + COL_LABEL;
      doc.rect(x, y, COL_PREV, rowH).fill(odd ? '#ebebeb' : '#efefef');
      doc.fillColor('#111111').fontSize(fs).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      t(fmt(prevVal, dec), x + 3, textY, { width: COL_PREV - 8, align: 'right' });

      x += COL_PREV;
      semVals.forEach((raw, i) => {
        doc.rect(x, y, COL_SEM, rowH).fill(i % 2 === 0 ? (odd ? '#fafafa' : '#ffffff') : (odd ? '#f5f5f5' : '#fafafa'));
        doc.fillColor(raw != null ? DARK : '#bbbbbb').fontSize(fs).font(bold ? 'Helvetica-Bold' : 'Helvetica');
        t(fmt(raw, dec), x + 2, textY, { width: COL_SEM - 4, align: 'center' });
        x += COL_SEM;
      });
    }

    function renderSection(rows, sems, prev, labelTipo, bgTitulo, titulo) {
      const rowH = calcRowH(rows.length);
      drawHeader(labelTipo);

      let y = CONTENT_TOP;
      doc.rect(MAR, y, W, TITLE_H - 2).fill(bgTitulo);
      doc.fillColor(bgTitulo === GOLD ? '#0a0a0a' : GOLD).fontSize(8.5).font('Helvetica-Bold');
      t(titulo, MAR + 9, y + 6, { width: W - 18 });
      y += TITLE_H;

      drawTableHeader(y);
      y += HEAD_H;

      rows.forEach((row, i) => {
        const semVals = sems.map(r => (r ? r[row.f] ?? null : null));
        drawDataRow(y, row, prev ? prev[row.f] : null, semVals, rowH, i % 2 !== 0);
        y += rowH;
      });
    }

    const labelTipo = tipo === 'comercial' ? 'RELATÓRIO COMERCIAL'
                    : tipo === 'tecnico'   ? 'RELATÓRIO TÉCNICO'
                    : 'RELATÓRIO COMPLETO';
    const totalPages = (renderC ? 1 : 0) + (renderT ? 1 : 0);
    let pageNum = 0;

    if (renderC) {
      pageNum++;
      renderSection(ROWS_C, semsC, prevC, labelTipo, GOLD, 'EQUIPE COMERCIAL');
      drawFooter(pageNum, totalPages);
    }
    if (renderT) {
      pageNum++;
      if (pageNum > 1) doc.addPage();
      renderSection(ROWS_T, semsT, prevT, labelTipo, CINZA, 'EQUIPE TÉCNICA');
      drawFooter(pageNum, totalPages);
    }

    doc.y = CONTENT_TOP;
    doc.flushPages();
    doc.end();

  } catch (err) {
    console.error('[pdf] erro:', err.message);
    if (!res.headersSent) res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
