const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verificarToken } = require('../middleware/auth');
const axios = require('axios');

// Configuração do Multer para upload de fotos de fichas
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'fichas');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const numeroFicha = req.body.numeroFicha?.replace(/[^a-zA-Z0-9]/g, '_') || 'ficha';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `ficha_${numeroFicha}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo inválido. Apenas JPG, JPEG e PNG são permitidos.'));
    }
  }
});

/**
 * @swagger
 * /api/vendas:
 *   post:
 *     summary: Cadastrar venda parcelada
 *     tags: [Vendas]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - clienteId
 *               - valor
 *               - parcelas
 *               - dataVencimento
 *               - descricao
 *               - numeroFicha
 *               - vendedorId
 *               - tipoVenda
 *               - rotaId
 *               - fotoFicha
 *             properties:
 *               clienteId:
 *                 type: string
 *               valor:
 *                 type: string
 *               parcelas:
 *                 type: string
 *               dataVencimento:
 *                 type: string
 *               descricao:
 *                 type: string
 *               numeroFicha:
 *                 type: string
 *               vendedorId:
 *                 type: string
 *               tipoVenda:
 *                 type: string
 *               rotaId:
 *                 type: string
 *               fotoFicha:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Venda cadastrada com sucesso
 *       400:
 *         description: Erro de validação
 *       404:
 *         description: Cliente não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', verificarToken, upload.single('fotoFicha'), async (req, res) => {
  try {
    console.log('[VENDA-PARCELADA] Iniciando cadastro de venda');
    
    const { pool } = req.app.locals;
    const {
      clienteId,
      valor,
      parcelas,
      dataVencimento,
      descricao,
      numeroFicha,
      vendedorId,
      tipoVenda,
      rotaId
    } = req.body;
    
    const fotoFicha = req.file;
    
    // 1️⃣ VALIDAR CAMPOS OBRIGATÓRIOS
    console.log('[VENDA-PARCELADA] Validando campos obrigatórios...');
    
    if (!clienteId || !valor || !parcelas || !dataVencimento || 
        !descricao || !numeroFicha || !vendedorId || !tipoVenda || 
        !rotaId || !fotoFicha) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Campos obrigatórios faltando'
      });
    }
    
    // Validar tipo de venda
    if (tipoVenda !== 'parcelado') {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Tipo de venda inválido. Use: parcelado'
      });
    }
    
    // 2️⃣ VALIDAR VALOR
    console.log('[VENDA-PARCELADA] Validando valor...');
    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Valor da venda inválido'
      });
    }
    
    // 3️⃣ VALIDAR PARCELAS
    console.log('[VENDA-PARCELADA] Validando parcelas...');
    const numeroParcelas = parseInt(parcelas);
    if (isNaN(numeroParcelas) || numeroParcelas < 1 || numeroParcelas > 60) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Número de parcelas deve ser entre 1 e 60'
      });
    }
    
    // 4️⃣ VALIDAR DATA
    console.log('[VENDA-PARCELADA] Validando data de vencimento...');
    const [dia, mes, ano] = dataVencimento.split('/');
    const dataObj = new Date(`${ano}-${mes}-${dia}`);
    
    if (isNaN(dataObj.getTime())) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Data de vencimento inválida'
      });
    }
    
    // Validar se data não é passada
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (dataObj < hoje) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Data de vencimento não pode ser no passado'
      });
    }
    
    // 5️⃣ VERIFICAR SE CLIENTE EXISTE
    console.log('[VENDA-PARCELADA] Verificando cliente...');
    const clienteResult = await pool.query(
      'SELECT id, asaas_id, nome, cpf_cnpj FROM clientes WHERE id = $1 AND deletado = false',
      [clienteId]
    );
    
    if (clienteResult.rows.length === 0) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }
    
    const cliente = clienteResult.rows[0];
    
    if (!cliente.asaas_id) {
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Cliente não possui ID do Asaas'
      });
    }
    
    // 6️⃣ CRIAR PARCELAMENTO NO ASAAS
    console.log('[VENDA-PARCELADA] Criando parcelamento no Asaas...');
    
    const asaasApi = axios.create({
      baseURL: process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3',
      headers: {
        'access_token': process.env.ASAAS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    const dataVencFormatada = dataObj.toISOString().split('T')[0];
    
    // Calcular valor da parcela (Asaas divide automaticamente)
    const valorParcela = parseFloat((valorNumerico / numeroParcelas).toFixed(2));
    
    console.log(`[VENDA-PARCELADA] Dados do parcelamento:`);
    console.log(`  Cliente: ${cliente.asaas_id}`);
    console.log(`  Valor total: R$ ${valorNumerico.toFixed(2)}`);
    console.log(`  Parcelas: ${numeroParcelas}x de R$ ${valorParcela.toFixed(2)}`);
    console.log(`  1º Vencimento: ${dataVencFormatada}`);
    
    let parcelamentoAsaas;
    
    try {
      // Criar parcelamento no Asaas (POST /payments com installmentCount)
      const parcelamentoResponse = await asaasApi.post('/payments', {
        customer: cliente.asaas_id,
        billingType: 'BOLETO',
        value: valorNumerico,
        dueDate: dataVencFormatada,
        installmentCount: numeroParcelas,
        installmentValue: valorParcela,
        description: descricao,
        externalReference: `FICHA-${numeroFicha}`,
        notificationDisabled: true
      });
      
      parcelamentoAsaas = parcelamentoResponse.data;
      
      console.log(`[VENDA-PARCELADA] ✅ Parcelamento criado - Asaas ID: ${parcelamentoAsaas.id}`);
      console.log(`[VENDA-PARCELADA] Installment ID: ${parcelamentoAsaas.installment}`);
      console.log(`[VENDA-PARCELADA] Status: ${parcelamentoAsaas.status}`);
      
    } catch (asaasError) {
      console.error('[VENDA-PARCELADA] ❌ Erro ao criar parcelamento no Asaas:', asaasError.response?.data || asaasError.message);
      
      if (fotoFicha) fs.unlinkSync(fotoFicha.path);
      
      return res.status(500).json({
        sucesso: false,
        mensagem: `Erro ao criar parcelamento no Asaas: ${asaasError.response?.data?.errors?.[0]?.description || asaasError.message}`
      });
    }
    
    // 7️⃣ BUSCAR DETALHES DAS PARCELAS CRIADAS NO ASAAS
    console.log('[VENDA-PARCELADA] Buscando detalhes das parcelas...');
    
    let parcelasCriadasAsaas = [];
    const installmentId = parcelamentoAsaas.installment || null;
    
    try {
      // Se o Asaas retornou um installment ID, buscar as cobranças vinculadas
      if (installmentId) {
        const paymentsResponse = await asaasApi.get('/payments', {
          params: {
            installment: installmentId,
            limit: 100
          }
        });
        
        parcelasCriadasAsaas = paymentsResponse.data.data.sort((a, b) => 
          new Date(a.dueDate) - new Date(b.dueDate)
        );
        
        console.log(`[VENDA-PARCELADA] ✅ ${parcelasCriadasAsaas.length} parcelas obtidas do Asaas`);
      } else {
        // Se não tem installment ID, a própria cobrança já é a primeira parcela
        parcelasCriadasAsaas = [parcelamentoAsaas];
        console.log(`[VENDA-PARCELADA] ✅ Cobrança única criada no Asaas`);
      }
      
    } catch (listError) {
      console.error('[VENDA-PARCELADA] ⚠️ Erro ao buscar parcelas do Asaas:', listError.message);
      // Não é crítico, continua mesmo se não conseguir buscar os detalhes
      parcelasCriadasAsaas = [];
    }
    
    // 8️⃣ SALVAR NO BANCO DE DADOS LOCAL
    console.log('[VENDA-PARCELADA] Salvando parcelamento no banco de dados...');
    
    let parcelamentoLocalId = null;
    let cobrancasLocais = [];
    
    try {
      const pool = req.app.locals.pool;
      const dbClient = await pool.connect();
      
      try {
        await dbClient.query('BEGIN');
        
        // Inserir parcelamento na tabela parcelamentos
        const insertParcelamento = await dbClient.query(`
          INSERT INTO parcelamentos (
            asaas_id,
            valor,
            valor_parcela,
            numero_parcelas,
            forma_pagamento,
            descricao,
            cliente_asaas_id,
            data_criacao_asaas
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
          RETURNING id, asaas_id
        `, [
          installmentId || parcelamentoAsaas.id,
          valorNumerico,
          valorParcela,
          numeroParcelas,
          'BOLETO',
          descricao,
          cliente.asaas_id
        ]);
        
        parcelamentoLocalId = insertParcelamento.rows[0].id;
        console.log(`[VENDA-PARCELADA] ✅ Parcelamento salvo - ID local: ${parcelamentoLocalId}`);
        
        // Inserir cada cobrança na tabela cobrancas
        if (parcelasCriadasAsaas.length > 0) {
          for (let i = 0; i < parcelasCriadasAsaas.length; i++) {
            const payment = parcelasCriadasAsaas[i];
            
            const insertCobranca = await dbClient.query(`
              INSERT INTO cobrancas (
                asaas_id,
                valor,
                descricao,
                forma_pagamento,
                status,
                data_vencimento,
                data_criacao_asaas,
                cliente_asaas_id,
                parcelamento_id,
                numero_parcela,
                referencia_externa,
                nosso_numero,
                url_boleto,
                url_fatura
              ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8, $9, $10, $11, $12, $13)
              RETURNING id, asaas_id
            `, [
              payment.id,
              payment.value,
              payment.description || descricao,
              payment.billingType || 'BOLETO',
              payment.status || 'PENDING',
              payment.dueDate,
              cliente.asaas_id,
              installmentId,
              i + 1,
              payment.externalReference || null,
              payment.nossoNumero || null,
              payment.bankSlipUrl || null,
              payment.invoiceUrl || null
            ]);
            
            cobrancasLocais.push({
              id: insertCobranca.rows[0].id,
              numero: i + 1,
              valor: payment.value,
              dataVencimento: payment.dueDate,
              asaasPaymentId: payment.id,
              status: payment.status,
              linkBoleto: payment.bankSlipUrl || null,
              linkPix: payment.invoiceUrl || null
            });
          }
          
          console.log(`[VENDA-PARCELADA] ✅ ${cobrancasLocais.length} cobranças salvas no banco`);
        }
        
        await dbClient.query('COMMIT');
        
      } catch (dbError) {
        await dbClient.query('ROLLBACK');
        throw dbError;
      } finally {
        dbClient.release();
      }
      
    } catch (dbError) {
      console.error('[VENDA-PARCELADA] ❌ Erro ao salvar no banco:', dbError.message);
      // Venda criada no Asaas mas não salva localmente - registrar erro mas não falhar
    }
    
    // 9️⃣ RESPOSTA DE SUCESSO
    res.json({
      sucesso: true,
      mensagem: 'Venda parcelada cadastrada com sucesso',
      vendaId: parcelamentoLocalId, // ID para uso no frontend
      venda: {
        id: parcelamentoLocalId,
        clienteId: parseInt(clienteId),
        clienteNome: cliente.nome,
        clienteCpf: cliente.cpf_cnpj,
        vendedorId: parseInt(vendedorId),
        rotaId: parseInt(rotaId),
        tipoVenda: tipoVenda,
        valorTotal: valorNumerico,
        numeroParcelas: numeroParcelas,
        descricao: descricao,
        numeroFicha: numeroFicha,
        fotoFichaUrl: fotoFicha ? `/uploads/fichas/${path.basename(fotoFicha.path)}` : null,
        dataVencimentoPrimeira: dataObj.toISOString().split('T')[0],
        asaasInstallmentId: installmentId || parcelamentoAsaas.id,
        parcelas: cobrancasLocais.length > 0 ? cobrancasLocais : parcelasCriadasAsaas.map((p, i) => ({
          numero: i + 1,
          valor: p.value,
          dataVencimento: p.dueDate,
          asaasPaymentId: p.id,
          status: p.status,
          linkBoleto: p.bankSlipUrl || null,
          linkPix: p.invoiceUrl || null
        }))
      }
    });
    
  } catch (error) {
    console.error('[VENDA-PARCELADA] ❌ Erro interno:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao processar venda'
    });
  }
});

// Middleware para tratar erros do Multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      sucesso: false,
      mensagem: `Erro no upload: ${error.message}`
    });
  } else if (error) {
    return res.status(400).json({
      sucesso: false,
      mensagem: error.message
    });
  }
  next();
});

/**
 * @swagger
 * /api/vendas/{id}/pdf:
 *   get:
 *     summary: Baixar PDF do carnê de parcelamento
 *     tags: [Vendas]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do parcelamento no banco de dados local
 *     responses:
 *       200:
 *         description: PDF do carnê de parcelamento
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Parcelamento não encontrado
 *       500:
 *         description: Erro ao buscar PDF
 */
router.get('/:id/pdf', verificarToken, async (req, res) => {
  const { id } = req.params;
  
  console.log(`[VENDA-PDF] Buscando PDF do parcelamento ID: ${id}`);
  
  try {
    // 1️⃣ BUSCAR PARCELAMENTO NO BANCO LOCAL
    const pool = req.app.locals.pool;
    const dbClient = await pool.connect();
    
    let parcelamento;
    try {
      const result = await dbClient.query(
        'SELECT id, asaas_id, valor, numero_parcelas, cliente_asaas_id FROM parcelamentos WHERE id = $1 AND deletado = false',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Parcelamento não encontrado'
        });
      }
      
      parcelamento = result.rows[0];
      console.log(`[VENDA-PDF] Parcelamento encontrado - Asaas ID: ${parcelamento.asaas_id}`);
      
    } finally {
      dbClient.release();
    }
    
    // 2️⃣ BUSCAR PDF DO CARNÊ NO ASAAS
    console.log('[VENDA-PDF] Buscando PDF do carnê no Asaas...');
    
    const asaasApi = axios.create({
      baseURL: process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3',
      headers: {
        'access_token': process.env.ASAAS_API_KEY
      },
      responseType: 'stream' // Importante: receber como stream
    });
    
    try {
      // Endpoint do Asaas para gerar carnê de parcelamento
      const pdfResponse = await asaasApi.get(`/installments/${parcelamento.asaas_id}/paymentBook`);
      
      console.log('[VENDA-PDF] ✅ PDF obtido do Asaas, enviando para cliente...');
      
      // 3️⃣ ENVIAR PDF PARA O CLIENTE
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="carne_parcelamento_${id}.pdf"`);
      
      // Fazer pipe do stream do Asaas direto para a resposta
      pdfResponse.data.pipe(res);
      
    } catch (asaasError) {
      console.error('[VENDA-PDF] ❌ Erro ao buscar PDF no Asaas:', asaasError.response?.data || asaasError.message);
      
      // Se o Asaas retornar erro, tentar gerar os boletos individuais
      if (asaasError.response?.status === 404) {
        return res.status(404).json({
          sucesso: false,
          mensagem: 'Carnê não disponível no Asaas. O parcelamento pode não ter sido criado corretamente.'
        });
      }
      
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro ao buscar carnê no Asaas. Tente novamente mais tarde.'
      });
    }
    
  } catch (error) {
    console.error('[VENDA-PDF] ❌ Erro geral:', error.message);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao processar solicitação'
    });
  }
});

module.exports = router;
