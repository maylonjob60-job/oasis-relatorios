require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiRouter        = require('./routes/api');
const pdfRouter        = require('./routes/pdf');
const relatoriosRouter = require('./routes/relatorios');
const clientesRouter   = require('./routes/clientes');

app.use('/api', apiRouter);
app.use('/api', pdfRouter);
app.use('/api/relatorios', relatoriosRouter);
app.use('/api/clientes', clientesRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n✅ Servidor rodando em http://localhost:${PORT}\n`);
  });
}

module.exports = app;
