const express  = require('express');
const router   = express.Router();
const { supabase } = require('../db/database');

function int(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function safeDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// ── POST /api/comercial ───────────────────────────────────────────────────────

router.post('/comercial', async (req, res) => {
  const { semana, mes, ano, overwrite } = req.body;
  if (!int(semana) || !int(mes) || !int(ano))
    return res.status(400).json({ erro: 'semana, mes e ano são obrigatórios e devem ser números.' });

  const fields = [
    'leads_semana', 'leads_mes', 'alunos_ativos', 'alunos_anual',
    'alunos_semestral', 'alunos_mensal_recorrente', 'alunos_mensal_comum',
    'alunos_natacao', 'alunos_saidos_mes', 'alunos_novos_semana',
    'alunos_novos_mes', 'alunos_bloqueados',
  ];
  const row = { semana: int(semana), mes: int(mes), ano: int(ano) };
  fields.forEach(f => { row[f] = int(req.body[f]) ?? 0; });

  const { data: existing } = await supabase.from('comercial')
    .select('id, data_registro').eq('semana', int(semana)).eq('mes', int(mes)).eq('ano', int(ano)).maybeSingle();

  if (existing) {
    if (!overwrite)
      return res.status(409).json({ conflito: true, tabela: 'comercial', id: existing.id, data_registro: existing.data_registro });
    const { data, error } = await supabase.from('comercial').update(row).eq('id', existing.id).select('id').single();
    if (error) return res.status(500).json({ erro: error.message });
    return res.status(200).json({ id: data.id, atualizado: true });
  }

  const { data, error } = await supabase.from('comercial').insert([row]).select('id').single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json({ id: data.id });
});

// ── POST /api/tecnico ─────────────────────────────────────────────────────────

router.post('/tecnico', async (req, res) => {
  const { semana, mes, ano, overwrite } = req.body;
  if (!int(semana) || !int(mes) || !int(ano))
    return res.status(400).json({ erro: 'semana, mes e ano são obrigatórios e devem ser números.' });

  const fields = [
    'revisoes_treinos', 'novas_avaliacoes', 'treinos_vencidos', 'treinos_vencendo_7dias',
    'alunos_experiencia', 'alunos_fecharam_experiencia', 'consultoria_fisica',
    'total_encarteirados', 'encarteirados_diego', 'encarteirados_luiz',
    'encarteirados_vinicius', 'encarteirados_arthur', 'encarteirados_caio',
    'encarteirados_lucas', 'encarteirados_michele',
  ];
  const row = { semana: int(semana), mes: int(mes), ano: int(ano) };
  fields.forEach(f => { row[f] = int(req.body[f]) ?? 0; });

  const { data: existing } = await supabase.from('tecnico')
    .select('id, data_registro').eq('semana', int(semana)).eq('mes', int(mes)).eq('ano', int(ano)).maybeSingle();

  if (existing) {
    if (!overwrite)
      return res.status(409).json({ conflito: true, tabela: 'tecnico', id: existing.id, data_registro: existing.data_registro });
    const { data, error } = await supabase.from('tecnico').update(row).eq('id', existing.id).select('id').single();
    if (error) return res.status(500).json({ erro: error.message });
    return res.status(200).json({ id: data.id, atualizado: true });
  }

  const { data, error } = await supabase.from('tecnico').insert([row]).select('id').single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json({ id: data.id });
});

// ── GET /api/historico ────────────────────────────────────────────────────────

router.get('/historico', async (req, res) => {
  const { semana, mes, ano, data_inicio, data_fim } = req.query;

  function applyFilters(q) {
    if (int(semana)        !== null) q = q.eq('semana', int(semana));
    if (int(mes)           !== null) q = q.eq('mes',    int(mes));
    if (int(ano)           !== null) q = q.eq('ano',    int(ano));
    if (safeDate(data_inicio))       q = q.gte('data_registro', safeDate(data_inicio));
    if (safeDate(data_fim))          q = q.lte('data_registro', safeDate(data_fim) + 'T23:59:59');
    return q;
  }

  const [{ data: comercial, error: e1 }, { data: tecnico, error: e2 }] = await Promise.all([
    applyFilters(supabase.from('comercial').select('*').order('data_registro', { ascending: false })),
    applyFilters(supabase.from('tecnico').select('*').order('data_registro', { ascending: false })),
  ]);

  if (e1 || e2) return res.status(500).json({ erro: (e1 || e2).message });
  res.json({ total: { comercial: comercial.length, tecnico: tecnico.length }, comercial, tecnico });
});

// ── GET /api/historico/:id/comercial ─────────────────────────────────────────

router.get('/historico/:id/comercial', async (req, res) => {
  const id = int(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  const { data, error } = await supabase.from('comercial').select('*').eq('id', id).single();
  if (error) return res.status(404).json({ erro: 'Registro comercial não encontrado.' });
  res.json(data);
});

// ── GET /api/historico/:id/tecnico ───────────────────────────────────────────

router.get('/historico/:id/tecnico', async (req, res) => {
  const id = int(req.params.id);
  if (!id) return res.status(400).json({ erro: 'ID inválido.' });
  const { data, error } = await supabase.from('tecnico').select('*').eq('id', id).single();
  if (error) return res.status(404).json({ erro: 'Registro técnico não encontrado.' });
  res.json(data);
});

// ── GET /api/comparar ─────────────────────────────────────────────────────────

router.get('/comparar', async (req, res) => {
  const { semana1, mes1, ano1, semana2, mes2, ano2 } = req.query;
  const temP1 = int(semana1) || int(mes1) || int(ano1);
  const temP2 = int(semana2) || int(mes2) || int(ano2);
  if (!temP1 || !temP2)
    return res.status(400).json({
      erro: 'Informe ao menos um filtro para cada período (semana1/mes1/ano1 e semana2/mes2/ano2).',
    });

  async function buscarPeriodo(semana, mes, ano) {
    function applyFilters(q) {
      if (int(semana) !== null) q = q.eq('semana', int(semana));
      if (int(mes)    !== null) q = q.eq('mes',    int(mes));
      if (int(ano)    !== null) q = q.eq('ano',    int(ano));
      return q;
    }
    const [{ data: c }, { data: t }] = await Promise.all([
      applyFilters(supabase.from('comercial').select('*').order('data_registro', { ascending: false }).limit(1)),
      applyFilters(supabase.from('tecnico').select('*').order('data_registro', { ascending: false }).limit(1)),
    ]);
    return { comercial: c?.[0] || null, tecnico: t?.[0] || null };
  }

  const [p1, p2] = await Promise.all([
    buscarPeriodo(semana1, mes1, ano1),
    buscarPeriodo(semana2, mes2, ano2),
  ]);

  res.json({
    periodo1: { filtro: { semana: semana1, mes: mes1, ano: ano1 }, ...p1 },
    periodo2: { filtro: { semana: semana2, mes: mes2, ano: ano2 }, ...p2 },
  });
});

// ── GET /api/dashboard ────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const [
    { data: recenteC },
    { data: recenteT },
    { data: grafC },
    { data: grafT },
  ] = await Promise.all([
    supabase.from('comercial').select('*').order('data_registro', { ascending: false }).limit(1),
    supabase.from('tecnico').select('*').order('data_registro', { ascending: false }).limit(1),
    supabase.from('comercial').select('*').order('data_registro', { ascending: false }).limit(8),
    supabase.from('tecnico').select('*').order('data_registro', { ascending: false }).limit(8),
  ]);

  res.json({
    recente: { comercial: recenteC?.[0] || null, tecnico: recenteT?.[0] || null },
    graficos: {
      comercial: (grafC || []).reverse(),
      tecnico:   (grafT || []).reverse(),
    },
  });
});

module.exports = router;
