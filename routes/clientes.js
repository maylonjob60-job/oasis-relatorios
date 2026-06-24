const express = require('express');
const router  = express.Router();

router.get('/',     (_req, res) => res.json([]));
router.get('/:id',  (_req, res) => res.status(404).json({ erro: 'Não encontrado' }));
router.post('/',    (_req, res) => res.status(501).json({ erro: 'Não implementado' }));
router.put('/:id',  (_req, res) => res.status(501).json({ erro: 'Não implementado' }));
router.delete('/:id',(_req, res) => res.status(501).json({ erro: 'Não implementado' }));

module.exports = router;
