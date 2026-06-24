const express     = require('express');
const router      = express.Router();
const PDFDocument = require('pdfkit');
const { supabase } = require('../db/database');

const MESES    = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TRAINERS = [
  { key: 'diego',    nome: 'Diego'    },
  { key: 'luiz',     nome: 'Luiz'     },
  { key: 'vinicius', nome: 'Vinícius' },
  { key: 'arthur',   nome: 'Arthur'   },
  { key: 'caio',     nome: 'Caio'     },
  { key: 'lucas',    nome: 'Lucas'    },
  { key: 'michele',  nome: 'Michele'  },
];

function fmt(v, dec = 0) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return isNaN(n) ? String(v) : dec > 0 ? n.toFixed(dec) : String(n);
}

/* ── POST /api/gerar-pdf ──────────────────────────────────────────────────── */
/*
 * Body: { tipo: 'completo' | 'comercial' | 'tecnico', registro_id: number }
 * Resposta: streaming PDF direto (Content-Disposition: attachment)
 */
router.post('/gerar-pdf', async (req, res) => {
  const { tipo = 'completo', registro_id } = req.body;
  const id = parseInt(registro_id) || 0;

  if (!id) return res.status(400).json({ erro: 'Informe registro_id.' });
  if (!['completo', 'comercial', 'tecnico'].includes(tipo))
    return res.status(400).json({ erro: 'tipo deve ser: completo, comercial ou tecnico.' });

  try {
    let c = null, t = null;

    if (tipo === 'comercial' || tipo === 'completo') {
      const { data, error } = await supabase.from('comercial').select('*').eq('id', id).single();
      if (error || !data) return res.status(404).json({ erro: 'Registro comercial não encontrado.' });
      c = data;

      if (tipo === 'completo') {
        const { data: tData } = await supabase
          .from('tecnico').select('*')
          .eq('semana', c.semana).eq('mes', c.mes).eq('ano', c.ano)
          .order('data_registro', { ascending: false }).limit(1);
        t = tData?.[0] || null;
      }
    } else {
      const { data, error } = await supabase.from('tecnico').select('*').eq('id', id).single();
      if (error || !data) return res.status(404).json({ erro: 'Registro técnico não encontrado.' });
      t = data;
    }

    const ref     = c || t;
    const semana  = ref.semana;
    const mes     = ref.mes;
    const ano     = ref.ano;
    const mesNome = MESES[mes] || mes;
    const now     = new Date();
    const dataStr = now.toLocaleDateString('pt-BR');
    const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nomeArq = `oasis_${ano}${String(mes).padStart(2,'0')}S${String(semana).padStart(2,'0')}_${tipo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const PW = doc.page.width;
    const W  = PW - 100;

    const COR_PRETO    = '#1a1a1a';
    const COR_AMARELO  = '#F5C400';
    const COR_OFFWHITE = '#F5F0E8';

    const labelTipo = tipo === 'comercial' ? 'RELATÓRIO COMERCIAL'
                    : tipo === 'tecnico'   ? 'RELATÓRIO TÉCNICO'
                    : 'RELATÓRIO COMPLETO';

    doc.rect(0, 0, PW, 84).fill(COR_PRETO);
    doc.rect(0, 84, PW, 4).fill(COR_AMARELO);

    doc.rect(50, 20, 44, 44).fill(COR_AMARELO);
    doc.fillColor(COR_PRETO).fontSize(22).font('Helvetica-Bold').text('O', 60, 30);
    doc.fillColor(COR_AMARELO).fontSize(26).font('Helvetica-Bold').text('OÁSIS', 102, 22);
    doc.fillColor('#cccccc').fontSize(12).font('Helvetica').text('Centro de Treinamento & Saúde', 102, 52);

    doc.fillColor(COR_AMARELO).fontSize(11).font('Helvetica-Bold')
       .text(labelTipo, 0, 22, { width: PW - 50, align: 'right' });
    doc.fillColor('#aaaaaa').fontSize(10).font('Helvetica')
       .text(`Semana ${semana} · ${mesNome} de ${ano}`, 0, 42, { width: PW - 50, align: 'right' });
    doc.fillColor('#777777').fontSize(9)
       .text(`Gerado em ${dataStr} às ${horaStr}`, 0, 62, { width: PW - 50, align: 'right' });

    doc.y = 108;

    function cabecalhoSecao(titulo, fundo) {
      const y = doc.y;
      doc.rect(50, y, W, 30).fill(fundo);
      const textColor = fundo === COR_AMARELO ? COR_PRETO : COR_AMARELO;
      doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold')
         .text(titulo, 64, y + 9, { width: W - 28 });
      doc.y = y + 34;
    }

    function linhas2col(rows) {
      rows.forEach(([l1, v1, l2, v2], i) => {
        const y   = doc.y;
        const bg  = i % 2 === 0 ? COR_OFFWHITE : '#ffffff';
        const col = W / 2;
        doc.rect(50, y, W, 26).fill(bg);
        if (l1) {
          doc.fillColor('#888888').fontSize(9).font('Helvetica')
             .text(String(l1).toUpperCase(), 58, y + 4, { width: col * 0.58 });
          doc.fillColor(COR_PRETO).fontSize(13).font('Helvetica-Bold')
             .text(fmt(v1), 58, y + 4, { width: col - 16, align: 'right' });
        }
        if (l2) {
          const x2 = 50 + col + 8;
          doc.fillColor('#888888').fontSize(9).font('Helvetica')
             .text(String(l2).toUpperCase(), x2, y + 4, { width: col * 0.58 });
          doc.fillColor(COR_PRETO).fontSize(13).font('Helvetica-Bold')
             .text(fmt(v2), x2, y + 4, { width: col - 16, align: 'right' });
        }
        doc.y = y + 28;
      });
    }

    function tabelaEncarteirados(tecnico, alunosAtivos) {
      const metaUnit = alunosAtivos > 0 ? Math.round(alunosAtivos * 0.6 / 7) : null;
      const yH = doc.y;
      doc.rect(50, yH, W, 28).fill('#333333');
      doc.fillColor(COR_AMARELO).fontSize(9).font('Helvetica-Bold')
         .text('TREINADOR',      60,            yH + 9, { width: W * 0.38 });
      doc.fillColor(COR_AMARELO).fontSize(9).font('Helvetica-Bold')
         .text('ENCARTEIRADOS', 50 + W * 0.38, yH + 9, { width: W * 0.28, align: 'center' });
      const metaLabel = metaUnit != null ? `META / TREINADOR: ${metaUnit}` : 'SEM META';
      doc.fillColor(COR_AMARELO).fontSize(9).font('Helvetica-Bold')
         .text(metaLabel, 50 + W * 0.66, yH + 9, { width: W * 0.32, align: 'right' });
      doc.y = yH + 32;

      TRAINERS.forEach((tr, i) => {
        const val     = tecnico[`encarteirados_${tr.key}`] ?? 0;
        const atingiu = metaUnit != null ? val >= metaUnit : null;
        const bg      = i % 2 === 0 ? COR_OFFWHITE : '#ffffff';
        const y       = doc.y;
        doc.rect(50, y, W, 28).fill(bg);
        doc.fillColor(COR_PRETO).fontSize(12).font('Helvetica-Bold')
           .text(tr.nome, 60, y + 7, { width: W * 0.38 });
        doc.fillColor(COR_PRETO).fontSize(14).font('Helvetica-Bold')
           .text(String(val), 50 + W * 0.38, y + 6, { width: W * 0.28, align: 'center' });
        if (atingiu !== null) {
          const cor     = atingiu ? '#1a7a40' : '#c0392b';
          const bgBadge = atingiu ? '#e5f5ec'  : '#fdecea';
          const texto   = atingiu ? '✓  Meta atingida' : '✗  Abaixo da meta';
          doc.rect(50 + W * 0.68, y + 6, W * 0.30, 16).fill(bgBadge);
          doc.fillColor(cor).fontSize(9).font('Helvetica-Bold')
             .text(texto, 50 + W * 0.68, y + 9, { width: W * 0.30, align: 'center' });
        }
        doc.y = y + 30;
      });

      const yTot = doc.y;
      doc.rect(50, yTot, W, 30).fill(COR_PRETO);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
         .text('TOTAL ENCARTEIRADOS', 60, yTot + 9, { width: W * 0.5 });
      doc.fillColor(COR_AMARELO).fontSize(15).font('Helvetica-Bold')
         .text(String(tecnico.total_encarteirados ?? 0), 50 + W * 0.38, yTot + 7,
               { width: W * 0.28, align: 'center' });
      if (metaUnit != null) {
        const totalMeta = metaUnit * TRAINERS.length;
        const totalOk   = (tecnico.total_encarteirados ?? 0) >= totalMeta;
        const cor       = totalOk ? '#5ddd90' : '#ff8a80';
        doc.fillColor(cor).fontSize(10).font('Helvetica-Bold')
           .text(`Meta total: ${totalMeta}`, 50 + W * 0.66, yTot + 10,
                 { width: W * 0.32, align: 'right' });
      }
      doc.y = yTot + 34;
    }

    if ((tipo === 'completo' || tipo === 'comercial') && c) {
      cabecalhoSecao('EQUIPE COMERCIAL', COR_AMARELO);
      doc.moveDown(0.2);
      linhas2col([
        ['Leads na Semana',      c.leads_semana,              'Leads no Mês (acumulado)',   c.leads_mes],
        ['Alunos Ativos',        c.alunos_ativos,             'Alunos Novos na Semana',     c.alunos_novos_semana],
        ['Alunos Novos no Mês',  c.alunos_novos_mes,          'Saídas no Mês',              c.alunos_saidos_mes],
        ['Plano Anual',          c.alunos_anual,              'Mensal Recorrente',           c.alunos_mensal_recorrente],
        ['Mensal Comum',         c.alunos_mensal_comum,       'Natação',                    c.alunos_natacao],
      ]);
      doc.moveDown(1.2);
    }

    if ((tipo === 'completo' || tipo === 'tecnico') && t) {
      if (doc.y > doc.page.height - 340) doc.addPage();
      cabecalhoSecao('EQUIPE TÉCNICA', COR_PRETO);
      doc.moveDown(0.2);
      const conv = t.conversao_experiencia != null
        ? `${Number(t.conversao_experiencia).toFixed(1)}%` : '—';
      linhas2col([
        ['Revisões de Treinos',   t.revisoes_treinos,          'Novas Avaliações',           t.novas_avaliacoes],
        ['Treinos Vencidos',      t.treinos_vencidos,          'Vencendo em 7 dias',         t.treinos_vencendo_7dias],
        ['Alunos em Experiência', t.alunos_experiencia,        'Fecharam da Experiência',    t.alunos_fecharam_experiencia],
        ['Conversão Experiência', conv,                         'Consultoria Física',         t.consultoria_fisica],
      ]);
      doc.moveDown(1);
      if (doc.y > doc.page.height - 300) doc.addPage();
      cabecalhoSecao('ENCARTEIRADOS POR TREINADOR', '#333333');
      doc.moveDown(0.2);
      tabelaEncarteirados(t, c?.alunos_ativos ?? 0);
      doc.moveDown(0.8);
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = doc.page.height - 38;
      doc.rect(0, fy - 6, PW, 44).fill('#f5f5f5');
      doc.rect(0, fy - 7, PW, 1).fill('#dddddd');
      doc.fillColor('#999999').fontSize(9).font('Helvetica')
         .text(`Oásis Centro de Treinamento & Saúde  ·  Gerado em ${dataStr} às ${horaStr}`,
               50, fy + 2, { width: PW - 180 });
      doc.fillColor(COR_PRETO).fontSize(9).font('Helvetica-Bold')
         .text(`Página ${i + 1} de ${range.count}`,
               0, fy + 2, { width: PW - 50, align: 'right' });
    }

    doc.flushPages();
    doc.end();

  } catch (err) {
    console.error('[pdf] erro:', err.message);
    if (!res.headersSent) res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
