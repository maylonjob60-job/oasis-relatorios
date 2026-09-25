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
];

function fmt(v, dec = 0) {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return dec > 0 ? n.toFixed(dec) : String(n);
}

router.post('/gerar-pdf', async (req, res) => {
  const { tipo = 'completo', mes, ano } = req.body;
  const mesNum = parseInt(mes);
  const anoNum = parseInt(ano);

  if (!mesNum || !anoNum)
    return res.status(400).json({ erro: 'Informe mes e ano.' });
  if (!['completo', 'comercial', 'tecnico'].includes(tipo))
    return res.status(400).json({ erro: 'tipo inválido.' });

  let mesPrev = mesNum - 1, anoPrev = anoNum;
  if (mesPrev < 1) { mesPrev = 12; anoPrev--; }

  try {
    const [{ data: semC }, { data: semT }, { data: prevCArr }, { data: prevTArr }] =
      await Promise.all([
        supabase.from('comercial').select('*').eq('mes', mesNum).eq('ano', anoNum).order('semana'),
        supabase.from('tecnico').select('*').eq('mes', mesNum).eq('ano', anoNum).order('semana'),
        supabase.from('comercial').select('*').eq('mes', mesPrev).eq('ano', anoPrev)
          .order('semana', { ascending: false }).limit(1),
        supabase.from('tecnico').select('*').eq('mes', mesPrev).eq('ano', anoPrev)
          .order('semana', { ascending: false }).limit(1),
      ]);

    const prevC   = prevCArr?.[0] || null;
    const prevT   = prevTArr?.[0] || null;
    const semsC   = semC || [];
    const semsT   = semT || [];
    const numCols = Math.max(semsC.length, semsT.length, 4);

    const mesNome     = MESES[mesNum]  || String(mesNum);
    const mesPrevNome = MESES[mesPrev] || String(mesPrev);
    const now         = new Date();
    const dataStr     = now.toLocaleDateString('pt-BR');
    const horaStr     = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nomeArq     = `oasis_${anoNum}${String(mesNum).padStart(2,'0')}_${tipo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}"`);

    // ── Dimensões fixas ───────────────────────────────────────────────────────
    const PW  = 841.89;   // A4 landscape largura
    const PH  = 595.28;   // A4 landscape altura
    const MAR = 38;
    const W   = PW - MAR * 2;   // ~766

    const GOLD  = '#F5C400';
    const DARK  = '#1a1a1a';
    const CINZA = '#444444';

    const HEADER_H    = 59;   // cabeçalho escuro + linha dourada
    const FOOTER_H    = 22;
    const CONTENT_TOP = HEADER_H + 10;   // y onde conteúdo começa
    const CONTENT_H   = PH - CONTENT_TOP - FOOTER_H;  // altura útil por página

    // Geometria de colunas
    const COL_LABEL = 150;
    const COL_PREV  = 78;
    const COL_SEM   = Math.floor((W - COL_LABEL - COL_PREV) / numCols);

    // Geometria de linha: calculada por seção para caber numa só página
    const SEC_OVERHEAD = 20 + 28;   // título (20) + cabeçalho tabela (28)

    function calcRowH(numRows) {
      const available = CONTENT_H - SEC_OVERHEAD;
      // Distribui espaço uniformemente; limita entre 17 e 24pt
      return Math.min(24, Math.max(17, Math.floor(available / numRows)));
    }

    const ROWS_C = [
      { label: 'Leads na Semana',     f: 'leads_semana' },
      { label: 'Leads no Mês',        f: 'leads_mes' },
      { label: 'Alunos Ativos',       f: 'alunos_ativos',            bold: true },
      { label: 'Plano Anual',         f: 'alunos_anual' },
      { label: 'Plano Semestral',     f: 'alunos_semestral' },
      { label: 'Mensal Recorrente',   f: 'alunos_mensal_recorrente' },
      { label: 'Mensal Comum',        f: 'alunos_mensal_comum' },
      { label: 'Natação',             f: 'alunos_natacao' },
      { label: 'Alunos Bloqueados',   f: 'alunos_bloqueados' },
      { label: 'Novos na Semana',     f: 'alunos_novos_semana' },
      { label: 'Novos no Mês',        f: 'alunos_novos_mes' },
      { label: 'Saídas no Mês',       f: 'alunos_saidos_mes' },
    ];

    const ROWS_T = [
      { label: 'Revisões de Treinos',    f: 'revisoes_treinos' },
      { label: 'Novas Avaliações',       f: 'novas_avaliacoes' },
      { label: 'Treinos Vencidos',       f: 'treinos_vencidos' },
      { label: 'Vencendo em 7 dias',     f: 'treinos_vencendo_7dias' },
      { label: 'Alunos em Experiência',  f: 'alunos_experiencia' },
      { label: 'Fecharam Experiência',   f: 'alunos_fecharam_experiencia' },
      { label: 'Conversão Exp. (%)',     f: 'conversao_experiencia', dec: 1 },
      { label: 'Consultoria Física',     f: 'consultoria_fisica' },
      { label: 'Total Encarteirados',    f: 'total_encarteirados',   bold: true },
      ...TRAINERS.map(tr => ({ label: `  ↳ ${tr.nome}`, f: `encarteirados_${tr.key}` })),
    ];

    const doc = new PDFDocument({
      margin: 0,
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
      autoFirstPage: true,
    });
    doc.pipe(res);

    // ── Helpers: todos usam coordenadas explícitas e NÃO avançam o cursor ────

    function t(str, x, y, opts = {}) {
      // Renderiza texto e FORÇA doc.y de volta — impede PDFKit de gerar páginas
      const savedY = doc.y;
      doc.text(String(str), x, y, { lineBreak: false, ...opts });
      doc.y = savedY;
    }

    function drawPageBackground(pageBg = '#ffffff') {
      doc.rect(0, 0, PW, PH).fill(pageBg);
    }

    function drawHeader(labelTipo) {
      doc.rect(0, 0, PW, 56).fill(DARK);
      doc.rect(0, 56, PW, 3).fill(GOLD);

      // Ícone
      doc.rect(MAR, 9, 38, 38).fill(GOLD);
      doc.fillColor(DARK).fontSize(17).font('Helvetica-Bold');
      t('O', MAR + 8, 18);

      // Nome
      doc.fillColor(GOLD).fontSize(19).font('Helvetica-Bold');
      t('OÁSIS', MAR + 48, 12);
      doc.fillColor('#cccccc').fontSize(9.5).font('Helvetica');
      t('Centro de Treinamento & Saúde', MAR + 48, 32);

      // Tipo + data (direita)
      doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold');
      t(labelTipo, 0, 12, { width: PW - MAR, align: 'right' });
      doc.fillColor('#aaaaaa').fontSize(9).font('Helvetica');
      t(`${mesNome} de ${anoNum}`, 0, 28, { width: PW - MAR, align: 'right' });
      doc.fillColor('#666666').fontSize(7.5);
      t(`Gerado em ${dataStr} às ${horaStr}`, 0, 42, { width: PW - MAR, align: 'right' });
    }

    function drawFooter(pageNum, totalPages) {
      const fy = PH - FOOTER_H;
      doc.rect(0, fy, PW, FOOTER_H).fill('#f0f0f0');
      doc.rect(0, fy, PW, 1).fill('#cccccc');
      doc.fillColor('#888888').fontSize(7.5).font('Helvetica');
      t(`Oásis Centro de Treinamento & Saúde  ·  ${mesNome} / ${anoNum}  ·  ${dataStr} às ${horaStr}`,
        MAR, fy + 7, { width: PW - MAR * 2 - 60 });
      doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold');
      t(`Pág. ${pageNum} / ${totalPages}`, 0, fy + 7, { width: PW - MAR, align: 'right' });
    }

    function drawTableHeader(y, semLabels, HEAD_H) {
      doc.rect(MAR, y, W, HEAD_H).fill('#1e1e1e');
      doc.fillColor(GOLD).fontSize(7).font('Helvetica-Bold');
      t('INDICADOR', MAR + 4, y + HEAD_H / 2 - 4, { width: COL_LABEL - 8 });

      let x = MAR + COL_LABEL;
      doc.rect(x, y, COL_PREV, HEAD_H).fill('#2a2a2a');
      doc.fillColor(GOLD).fontSize(7.5).font('Helvetica-Bold');
      t(mesPrevNome.toUpperCase(), x + 3, y + 4, { width: COL_PREV - 6, align: 'center' });
      doc.fillColor('#888888').fontSize(6).font('Helvetica');
      t('MÊS ANTERIOR', x + 3, y + 14, { width: COL_PREV - 6, align: 'center' });

      x += COL_PREV;
      for (let i = 0; i < numCols; i++) {
        const lbl = semLabels[i] || `S${i + 1}`;
        doc.rect(x, y, COL_SEM, HEAD_H).fill(i % 2 === 0 ? '#1b3520' : '#172e1c');
        doc.fillColor('#5ddd90').fontSize(10).font('Helvetica-Bold');
        t(lbl, x + 2, y + HEAD_H / 2 - 5, { width: COL_SEM - 4, align: 'center' });
        x += COL_SEM;
      }
    }

    function drawDataRow(y, label, prevVal, semVals, rowH, opts = {}) {
      const { bold = false, odd = false, dec = 0 } = opts;
      const bg = bold ? '#fffbe6' : (odd ? '#f4f4f4' : '#ffffff');
      const textY = y + rowH / 2 - 4;
      const fs = bold ? 8.5 : 8;

      doc.rect(MAR, y, W, rowH).fill(bg);
      doc.rect(MAR, y + rowH - 1, W, 1).fill('#e0e0e0');

      doc.fillColor(bold ? '#111100' : '#333333').fontSize(fs)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica');
      t(label, MAR + 5, textY, { width: COL_LABEL - 10 });

      let x = MAR + COL_LABEL;
      doc.rect(x, y, COL_PREV, rowH).fill(odd ? '#ebebeb' : '#efefef');
      const pv = dec > 0 && prevVal != null ? Number(prevVal).toFixed(dec) : prevVal;
      doc.fillColor('#111111').fontSize(fs).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      t(fmt(pv), x + 3, textY, { width: COL_PREV - 6, align: 'right' });

      x += COL_PREV;
      for (let i = 0; i < numCols; i++) {
        const raw = semVals[i] ?? null;
        const sv  = dec > 0 && raw != null ? Number(raw).toFixed(dec) : raw;
        const cbg = i % 2 === 0 ? (odd ? '#fafafa' : '#ffffff') : (odd ? '#f5f5f5' : '#fafafa');
        doc.rect(x, y, COL_SEM, rowH).fill(cbg);
        doc.fillColor(raw != null ? DARK : '#bbbbbb').fontSize(fs)
           .font(bold ? 'Helvetica-Bold' : 'Helvetica');
        t(fmt(sv, dec), x + 2, textY, { width: COL_SEM - 4, align: 'center' });
        x += COL_SEM;
      }
    }

    function drawSectionTitle(y, titulo, bg = GOLD) {
      const h = 20;
      doc.rect(MAR, y, W, h).fill(bg);
      doc.fillColor(bg === GOLD ? '#0a0a0a' : GOLD).fontSize(8.5).font('Helvetica-Bold');
      t(titulo, MAR + 9, y + 5, { width: W - 18 });
      return h;
    }

    function renderSection(rows, sems, prev, labelTipo, bgTitulo, tituloTexto) {
      const semLabels = sems.map(r => `S${r.semana}`);
      while (semLabels.length < numCols) semLabels.push(`S${semLabels.length + 1}`);

      const rowH  = calcRowH(rows.length);
      const HEAD_H = Math.max(24, rowH + 4);

      let y = CONTENT_TOP;

      drawPageBackground('#fafafa');
      drawHeader(labelTipo);

      // Título da seção
      const titleH = drawSectionTitle(y, tituloTexto, bgTitulo);
      y += titleH + 2;

      // Cabeçalho da tabela
      drawTableHeader(y, semLabels, HEAD_H);
      y += HEAD_H;

      // Linhas de dados
      rows.forEach((r, i) => {
        const semVals = Array.from({ length: numCols }, (_, ci) => sems[ci]?.[r.f] ?? null);
        drawDataRow(y, r.label, prev?.[r.f], semVals, rowH,
          { bold: r.bold, odd: i % 2 !== 0, dec: r.dec || 0 });
        y += rowH;
      });
    }

    // ── Decide quais seções renderizar ────────────────────────────────────────
    const labelTipo = tipo === 'comercial' ? 'RELATÓRIO COMERCIAL'
                    : tipo === 'tecnico'   ? 'RELATÓRIO TÉCNICO'
                    : 'RELATÓRIO COMPLETO';

    const renderC = (tipo === 'completo' || tipo === 'comercial') && (semsC.length || prevC);
    const renderT = (tipo === 'completo' || tipo === 'tecnico')   && (semsT.length || prevT);
    const totalPages = (renderC ? 1 : 0) + (renderT ? 1 : 0);

    let pageNum = 0;

    if (renderC) {
      pageNum++;
      // PDFKit já cria a primeira página automaticamente
      renderSection(ROWS_C, semsC, prevC, labelTipo, GOLD, 'EQUIPE COMERCIAL');
      drawFooter(pageNum, totalPages);
    }

    if (renderT) {
      pageNum++;
      if (pageNum > 1) doc.addPage(); // segunda página apenas se necessário
      else drawPageBackground('#fafafa'); // única página
      renderSection(ROWS_T, semsT, prevT, labelTipo, CINZA, 'EQUIPE TÉCNICA');
      drawFooter(pageNum, totalPages);
    }

    // ── Fecha sem adicionar páginas extras ────────────────────────────────────
    doc.y = CONTENT_TOP; // segura cursor longe do limite da página
    doc.flushPages();
    doc.end();

  } catch (err) {
    console.error('[pdf] erro:', err.message);
    if (!res.headersSent) res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
