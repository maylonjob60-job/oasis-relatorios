============================================================
  OÁSIS RELATORIOS — Sistema de Gestão de Indicadores
  Centro de Treinamento & Saúde
============================================================

SOBRE O SISTEMA
---------------
Sistema local para registro e análise dos indicadores
semanais das equipes Comercial e Técnica da academia.

Todas as informações ficam salvas neste próprio computador,
dentro desta pasta. Não é necessária internet para usar.


COMO INICIAR
------------
1. Certifique-se de que o Node.js está instalado.
   (Se não estiver, o sistema vai avisar automaticamente)

2. Dê dois cliques no arquivo:  start.bat

3. Uma janela preta (terminal) vai abrir e o navegador
   vai se abrir automaticamente em:
   http://localhost:3000

4. Para parar o sistema: clique na janela preta e pressione
   Ctrl+C, ou simplesmente feche a janela.


ONDE FICAM OS DADOS
-------------------
Banco de dados:  db\oasis.db
PDFs gerados:    pdfs\

Esses arquivos ficam DENTRO da pasta do projeto.
Para ver os PDFs gerados, abra a pasta "pdfs\" com o
Explorador de Arquivos.


COMO FAZER BACKUP
-----------------
Copie a pasta inteira "oasis-relatorios" para um
pendrive, HD externo ou nuvem (Google Drive, OneDrive).

ATENÇÃO: o backup deve incluir o arquivo  db\oasis.db
pois é nele que ficam todos os dados registrados.

Dica: faça backup regularmente, especialmente depois de
inserir novos dados semanais.


COMO RESTAURAR EM OUTRO COMPUTADOR
-----------------------------------
1. Instale o Node.js no novo computador (nodejs.org)

2. Copie a pasta "oasis-relatorios" para o novo computador

3. Delete a pasta "node_modules" se ela vier junto
   (opcional — ela vai ser recriada automaticamente)

4. Dê dois cliques em  start.bat

   Na primeira execução, o sistema vai instalar as
   dependências automaticamente (requer internet apenas
   nessa etapa).

5. O sistema vai abrir com todos os seus dados intactos.


PÁGINAS DO SISTEMA
------------------
Dashboard       — Visão geral com gráficos e KPIs
Inserir Dados   — Registro semanal das equipes
Histórico       — Timeline de todos os registros
Comparar        — Comparação entre dois períodos


SUPORTE
-------
Em caso de problemas, entre em contato com o
responsável técnico do sistema.

============================================================
