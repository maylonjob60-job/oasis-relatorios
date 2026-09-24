const express     = require('express');
const router      = express.Router();
const PDFDocument = require('pdfkit');
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

/* ── POST /api/gerar-pdf ──────────────────────────────────────────────────── */
/*
 * Body: { tipo: 'completo' | 'comercial' | 'tecnico', mes: number, ano: number }
 *
 * Layout: A4 landscape — 1 coluna "Mês Anterior" + N colunas de semanas do mês atual
 */
router.post('/gerar-pdf', async (req, res) => {
  const { tipo = 'completo', mes, ano } = req.body;
  const mesNum = parseInt(mes);
  const anoNum = parseInt(ano);

  if (!mesNum || !anoNum)
    return res.status(400).json({ erro: 'Informe mes e ano.' });
  if (!['completo', 'comercial', 'tecnico'].includes(tipo))
    return res.status(400).json({ erro: 'tipo deve ser: completo, comercial ou tecnico.' });

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

    const prevC = prevCArr?.[0] || null;
    const prevT = prevTArr?.[0] || null;

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

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.pipe(res);

    const PW  = doc.page.width;   // 841.89
    const PH  = doc.page.height;  // 595.28
    const MAR = 40;
    const W   = PW - MAR * 2;     // ~762

    const GOLD   = '#F5C400';
    const DARK   = '#1a1a1a';
    const CINZA  = '#444444';

    // ── Cabeçalho ──────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 56).fill(DARK);
    doc.rect(0, 56, PW, 3).fill(GOLD);

    doc.rect(MAR, 8, 40, 40).fill(GOLD);
    doc.fillColor(DARK).fontSize(18).font('Helvetica-Bold').text('O', MAR + 9, 18);

    doc.fillColor(GOLD).fontSize(20).font('Helvetica-Bold').text('OÁSIS', MAR + 50, 12);
    doc.fillColor('#cccccc').fontSize(10).font('Helvetica')
       .text('Centro de Treinamento & Saúde', MAR + 50, 33);

    const labelTipo = tipo === 'comercial' ? 'RELATÓRIO COMERCIAL'
                    : tipo === 'tecnico'   ? 'RELATÓRIO TÉCNICO'
                    : 'RELATÓRIO COMPLETO';

    doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
       .text(labelTipo, 0, 12, { width: PW - MAR, align: 'right' });
    doc.fillColor('#aaaaaa').fontSize(9).font('Helvetica')
       .text(`${mesNome} de ${anoNum}`, 0, 28, { width: PW - MAR, align: 'right' });
    doc.fillColor('#666666').fontSize(8)
       .text(`Gerado em ${dataStr} às ${horaStr}`, 0, 42, { width: PW - MAR, align: 'right' });

    doc.y = 68;

    // ── Geometria das colunas ──────────────────────────────────────────────
    const COL_LABEL = 155;
    const COL_PREV  = 80;
    const COL_SEM   = Math.floor((W - COL_LABEL - COL_PREV) / numCols);
    const ROW_H     = 20;
    const HEAD_H    = 28;

    // ── Helpers ─────────────────────────────────────────────────────────────

    function headerRow(y, semLabels) {
      // Fundo linha header
      doc.rect(MAR, y, W, HEAD_H).fill('#1e1e1e');

      // "INDICADOR"
      doc.fillColor(GOLD).fontSize(7).font('Helvetica-Bold')
         .text('INDICADOR', MAR + 4, y + 10, { width: COL_LABEL - 8 });

      // Coluna mês anterior
      let x = MAR + COL_LABEL;
      doc.rect(x, y, COL_PREV, HEAD_H).fill('#2a2a2a');
      doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
         .text(mesPrevNome.toUpperCase(), x + 3, y + 4, { width: COL_PREV - 6, align: 'center' });
      doc.fillColor('#888888').fontSize(6.5).font('Helvetica')
         .text('MÊS ANTERIOR', x + 3, y + 16, { width: COL_PREV - 6, align: 'center' });

      // Colunas semanas
      x += COL_PREV;
      for (let i = 0; i < numCols; i++) {
        const label = semLabels[i] || `S${i + 1}`;
        doc.rect(x, y, COL_SEM, HEAD_H).fill(i % 2 === 0 ? '#1b3520' : '#172e1c');
        doc.fillColor('#5ddd90').fontSize(10).font('Helvetica-Bold')
           .text(label, x + 2, y + 8, { width: COL_SEM - 4, align: 'center' });
        x += COL_SEM;
      }
      return y + HEAD_H;
    }

    function dataRow(y, label, prevVal, semVals, opts = {}) {
      const { bold = false, odd = false, dec = 0 } = opts;
      const bgRow  = bold ? '#fffbe6' : (odd ? '#f4f4f4' : '#ffffff');
      doc.rect(MAR, y, W, ROW_H).fill(bgRow);

      // Linha divisória
      doc.rect(MAR, y + ROW_H - 1, W, 1).fill('#e8e8e8');

      // Label
      doc.fillColor(bold ? '#1a1a00' : '#333333')
         .fontSize(bold ? 8.5 : 8).font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, MAR + 4, y + 6, { width: COL_LABEL - 8 });

      // Mês anterior
      let x = MAR + COL_LABEL;
      doc.rect(x, y, COL_PREV, ROW_H).fill(odd ? '#ececec' : '#f0f0f0');
      const pv = dec > 0 && prevVal != null ? Number(prevVal).toFixed(dec) : prevVal;
      doc.fillColor('#111111').fontSize(bold ? 9 : 8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(fmt(pv), x + 3, y + 6, { width: COL_PREV - 6, align: 'right' });

      // Semanas
      x += COL_PREV;
      for (let i = 0; i < numCols; i++) {
        const raw = semVals[i] ?? null;
        const sv  = dec > 0 && raw != null ? Number(raw).toFixed(dec) : raw;
        const bg  = i % 2 === 0 ? (odd ? '#fafafa' : '#ffffff') : (odd ? '#f6f6f6' : '#fafafa');
        doc.rect(x, y, COL_SEM, ROW_H).fill(bg);
        doc.fillColor(raw != null ? DARK : '#bbbbbb')
           .fontSize(bold ? 9 : 8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica')
           .text(fmt(sv, dec), x + 2, y + 6, { width: COL_SEM - 4, align: 'center' });
        x += COL_SEM;
      }

      return y + ROW_H;
    }

    function sectionTitle(y, titulo, bg = GOLD) {
      doc.rect(MAR, y, W, 18).fill(bg);
      doc.fillColor(bg === GOLD ? DARK : GOLD)
         .fontSize(8.5).font('Helvetica-Bold')
         .text(titulo, MAR + 8, y + 4, { width: W - 16 });
      return y + 20;
    }

    function semLabels(sems) {
      const labels = sems.map(r => `S${r.semana}`);
      while (labels.length < numCols) labels.push(`S${labels.length + 1}`);
      return labels;
    }

    function semVals(sems, field) {
      return Array.from({ length: numCols }, (_, i) => sems[i]?.[field] ?? null);
    }

    // ── Seção Comercial ────────────────────────────────────────────────────
    if ((tipo === 'completo' || tipo === 'comercial') && (semsC.length || prevC)) {
      const lbls = semLabels(semsC);
      let y = doc.y;

      y = sectionTitle(y, 'EQUIPE COMERCIAL');
      y = headerRow(y, lbls);

      const rowsC = [
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

      rowsC.forEach((r, i) => {
        y = dataRow(y, r.label, prevC?.[r.f], semVals(semsC, r.f),
            { bold: r.bold, odd: i % 2 !== 0 });
      });

      doc.y = y + 6;
    }

    // ── Seção Técnica ──────────────────────────────────────────────────────
    if ((tipo === 'completo' || tipo === 'tecnico') && (semsT.length || prevT)) {
      if (doc.y > PH - 220) doc.addPage();
      const lbls = semLabels(semsT);
      let y = doc.y;

      y = sectionTitle(y, 'EQUIPE TÉCNICA', CINZA);
      y = headerRow(y, lbls);

      const rowsT = [
        { label: 'Revisões de Treinos',    f: 'revisoes_treinos' },
        { label: 'Novas Avaliações',       f: 'novas_avaliacoes' },
        { label: 'Treinos Vencidos',       f: 'treinos_vencidos' },
        { label: 'Vencendo em 7 dias',     f: 'treinos_vencendo_7dias' },
        { label: 'Alunos em Experiência',  f: 'alunos_experiencia' },
        { label: 'Fecharam Experiência',   f: 'alunos_fecharam_experiencia' },
        { label: 'Conversão Exp. (%)',     f: 'conversao_experiencia',  dec: 1 },
        { label: 'Consultoria Física',     f: 'consultoria_fisica' },
        { label: 'Total Encarteirados',    f: 'total_encarteirados',    bold: true },
        ...TRAINERS.map(tr => ({ label: `  ↳ ${tr.nome}`, f: `encarteirados_${tr.key}` })),
      ];

      rowsT.forEach((r, i) => {
        y = dataRow(y, r.label, prevT?.[r.f], semVals(semsT, r.f),
            { bold: r.bold, odd: i % 2 !== 0, dec: r.dec || 0 });
      });

      doc.y = y + 6;
    }

    // ── Rodapé ─────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = PH - 24;
      doc.rect(0, fy - 4, PW, 28).fill('#f5f5f5');
      doc.rect(0, fy - 5, PW, 1).fill('#dddddd');
      doc.fillColor('#999999').fontSize(7.5).font('Helvetica')
         .text(`Oásis Centro de Treinamento & Saúde  ·  ${mesNome} de ${anoNum}  ·  Gerado em ${dataStr} às ${horaStr}`,
               MAR, fy + 2, { width: PW - MAR * 2 - 60 });
      doc.fillColor(DARK).fontSize(7.5).font('Helvetica-Bold')
         .text(`Página ${i + 1} de ${range.count}`, 0, fy + 2, { width: PW - MAR, align: 'right' });
    }

    doc.flushPages();
    doc.end();

  } catch (err) {
    console.error('[pdf] erro:', err.message);
    if (!res.headersSent) res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
