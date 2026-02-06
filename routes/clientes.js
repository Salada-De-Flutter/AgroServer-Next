const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { listarClientesAsaas, criarClienteAsaas, buscarClientePorCpfAsaas } = require('../services/asaas');
const { verificarToken } = require('../middleware/auth');

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'documentos');
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const documento = req.body.documento;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${documento}_${timestamp}${ext}`);
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

// ========== FUNÇÕES DE VALIDAÇÃO ==========

// Validar CPF
function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]/g, '');
  
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // Todos os dígitos iguais
  
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  let digitoVerificador1 = resto === 10 || resto === 11 ? 0 : resto;
  
  if (digitoVerificador1 !== parseInt(cpf.charAt(9))) return false;
  
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  let digitoVerificador2 = resto === 10 || resto === 11 ? 0 : resto;
  
  return digitoVerificador2 === parseInt(cpf.charAt(10));
}

// Validar CNPJ
function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]/g, '');
  
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // Todos os dígitos iguais
  
  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;
  
  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos.charAt(1));
}

// Validar documento (CPF ou CNPJ)
function validarDocumento(documento) {
  const apenasNumeros = documento.replace(/[^\d]/g, '');
  
  if (apenasNumeros.length === 11) {
    return validarCPF(apenasNumeros);
  } else if (apenasNumeros.length === 14) {
    return validarCNPJ(apenasNumeros);
  }
  
  return false;
}

// Validar telefone
function validarTelefone(telefone) {
  const apenasNumeros = telefone.replace(/[^\d]/g, '');
  // Aceita 10 dígitos (fixo) ou 11 dígitos (celular)
  return apenasNumeros.length === 10 || apenasNumeros.length === 11;
}

// Converter dados do Asaas para formato do banco
function converterClienteAsaasParaDb(clienteAsaas) {
  return {
    asaas_id: clienteAsaas.id,
    nome: clienteAsaas.name,
    email: clienteAsaas.email,
    telefone: clienteAsaas.phone,
    celular: clienteAsaas.mobilePhone,
    cpf_cnpj: clienteAsaas.cpfCnpj,
    tipo_pessoa: clienteAsaas.personType,
    estrangeiro: clienteAsaas.foreignCustomer || false,
    endereco: clienteAsaas.address,
    numero_endereco: clienteAsaas.addressNumber,
    complemento: clienteAsaas.complement,
    bairro: clienteAsaas.province,
    cidade_id: clienteAsaas.city,
    cidade_nome: clienteAsaas.cityName,
    estado: clienteAsaas.state,
    pais: clienteAsaas.country || 'Brasil',
    cep: clienteAsaas.postalCode,
    emails_adicionais: clienteAsaas.additionalEmails,
    referencia_externa: clienteAsaas.externalReference,
    notificacoes_desabilitadas: clienteAsaas.notificationDisabled || false,
    observacoes: clienteAsaas.observations,
    deletado: clienteAsaas.deleted || false,
    data_criacao_asaas: clienteAsaas.dateCreated
  };
}

/**
 * @swagger
 * /api/clientes:
 *   post:
 *     summary: Cadastrar novo cliente com verificação
 *     tags: [Clientes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - documento
 *               - telefone
 *               - endereco
 *               - verificado
 *               - vendedorId
 *               - vendedorNome
 *               - fotoDocumento
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Nome completo do cliente
 *                 example: João Silva
 *               documento:
 *                 type: string
 *                 description: CPF ou CNPJ (apenas números)
 *                 example: 12345678900
 *               telefone:
 *                 type: string
 *                 description: Telefone com DDD (apenas números)
 *                 example: 11987654321
 *               endereco:
 *                 type: string
 *                 description: Endereço completo
 *                 example: Rua das Flores, 123, São Paulo - SP
 *               verificado:
 *                 type: string
 *                 description: Flag indicando verificação
 *                 enum: [true, false]
 *                 example: true
 *               vendedorId:
 *                 type: string
 *                 description: ID do vendedor
 *                 example: 5
 *               vendedorNome:
 *                 type: string
 *                 description: Nome do vendedor
 *                 example: Maria Santos
 *               fotoDocumento:
 *                 type: string
 *                 format: binary
 *                 description: Foto do documento (JPG/PNG)
 *     responses:
 *       200:
 *         description: Cliente cadastrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 mensagem:
 *                   type: string
 *                   example: Cliente cadastrado com sucesso
 *                 cliente:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     nome:
 *                       type: string
 *                     documento:
 *                       type: string
 *                     telefone:
 *                       type: string
 *                     endereco:
 *                       type: string
 *                     verificado:
 *                       type: boolean
 *                     vendedorId:
 *                       type: integer
 *                     vendedorNome:
 *                       type: string
 *                     asaasCustomerId:
 *                       type: string
 *                     fotoDocumentoUrl:
 *                       type: string
 *                     criadoEm:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Erro de validação
 *       409:
 *         description: Cliente já cadastrado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', verificarToken, upload.single('fotoDocumento'), async (req, res) => {
  let asaasCustomerId = null;
  let fotoPath = null;
  
  try {
    console.log('[CADASTRO-CLIENTE] Iniciando cadastro');
    
    const { pool } = req.app.locals;
    const { nome, documento, telefone, endereco, verificado, vendedorId, vendedorNome } = req.body;
    const fotoDocumento = req.file;
    
    // 1️⃣ VALIDAR DADOS RECEBIDOS
    console.log('[CADASTRO-CLIENTE] Validando dados...');
    
    if (!nome || !documento || !telefone || !endereco || !vendedorId || !vendedorNome) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Todos os campos obrigatórios devem ser preenchidos'
      });
    }
    
    if (!fotoDocumento) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Foto do documento é obrigatória'
      });
    }
    
    // Validar que passou pela verificação
    if (verificado !== 'true') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Cliente deve passar pela verificação antes do cadastro'
      });
    }
    
    // Validar formato do documento
    if (!validarDocumento(documento)) {
      // Remover foto se validação falhar
      if (fotoDocumento) {
        fs.unlinkSync(fotoDocumento.path);
      }
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF ou CNPJ inválido'
      });
    }
    
    // Validar telefone
    if (!validarTelefone(telefone)) {
      if (fotoDocumento) {
        fs.unlinkSync(fotoDocumento.path);
      }
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Telefone inválido'
      });
    }
    
    const documentoLimpo = documento.replace(/[^\d]/g, '');
    const telefoneLimpo = telefone.replace(/[^\d]/g, '');
    
    // Verificar se cliente já existe no banco local
    const clienteExistente = await pool.query(
      'SELECT id, nome, cpf_cnpj, telefone, endereco, asaas_id, verificado, vendedor_id, vendedor_nome, foto_documento_url, criado_em FROM clientes WHERE cpf_cnpj = $1 AND deletado = false',
      [documentoLimpo]
    );
    
    if (clienteExistente.rows.length > 0) {
      const cliente = clienteExistente.rows[0];
      console.log('[CADASTRO-CLIENTE] Cliente já existe no banco:', JSON.stringify(cliente, null, 2));
      
      if (fotoDocumento) {
        fs.unlinkSync(fotoDocumento.path);
      }
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Cliente com este documento já está cadastrado',
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          documento: cliente.cpf_cnpj,
          telefone: cliente.telefone,
          endereco: cliente.endereco,
          verificado: cliente.verificado,
          vendedorId: cliente.vendedor_id,
          vendedorNome: cliente.vendedor_nome,
          asaasCustomerId: cliente.asaas_id,
          fotoDocumentoUrl: cliente.foto_documento_url,
          criadoEm: cliente.criado_em
        }
      });
    }
    
    console.log('[CADASTRO-CLIENTE] Dados validados');
    fotoPath = fotoDocumento.path;
    
    // 2️⃣ VERIFICAR SE JÁ EXISTE NO ASAAS
    console.log('[CADASTRO-CLIENTE] Verificando se já existe no Asaas...');
    
    try {
      const clienteAsaasExistente = await buscarClientePorCpfAsaas(documentoLimpo);
      
      if (clienteAsaasExistente) {
        console.log('[CADASTRO-CLIENTE] Cliente já existe no Asaas:', clienteAsaasExistente.id);
        
        // Remover foto
        if (fotoPath) {
          fs.unlinkSync(fotoPath);
        }
        
        return res.status(409).json({
          sucesso: false,
          mensagem: 'Cliente com este CPF/CNPJ já está cadastrado no Asaas',
          cliente: {
            nome: clienteAsaasExistente.name,
            documento: clienteAsaasExistente.cpfCnpj,
            telefone: clienteAsaasExistente.phone || clienteAsaasExistente.mobilePhone,
            email: clienteAsaasExistente.email,
            asaasCustomerId: clienteAsaasExistente.id,
            cadastradoEm: clienteAsaasExistente.dateCreated
          }
        });
      }
    } catch (asaasError) {
      console.error('[CADASTRO-CLIENTE] Erro ao verificar no Asaas:', asaasError.message);
      // Se erro na busca, continua tentando cadastrar
    }
    
    // 3️⃣ CADASTRAR NO ASAAS
    console.log('[CADASTRO-CLIENTE] Cadastrando no Asaas...');
    
    const payloadAsaas = {
      name: nome,
      cpfCnpj: documentoLimpo,
      phone: telefoneLimpo,
      mobilePhone: telefoneLimpo,
      complement: endereco,
      notificationDisabled: true
    };
    
    try {
      const clienteAsaas = await criarClienteAsaas(payloadAsaas);
      asaasCustomerId = clienteAsaas.id;
      console.log('[CADASTRO-CLIENTE] Asaas ID:', asaasCustomerId);
    } catch (asaasError) {
      console.error('[CADASTRO-CLIENTE] Erro no Asaas:', asaasError.message);
      
      // Remover foto se cadastro no Asaas falhar
      if (fotoPath) {
        fs.unlinkSync(fotoPath);
      }
      
      return res.status(400).json({
        sucesso: false,
        mensagem: `Erro ao cadastrar no Asaas: ${asaasError.response?.data?.errors?.[0]?.description || asaasError.message}`
      });
    }
    
    // 4️⃣ SALVAR NO DATABASE
    console.log('[CADASTRO-CLIENTE] Salvando no database...');
    
    const fotoUrl = `/uploads/documentos/${path.basename(fotoPath)}`;
    
    const resultDb = await pool.query(
      `INSERT INTO clientes (
        nome,
        cpf_cnpj,
        telefone,
        endereco,
        asaas_id,
        verificado,
        vendedor_id,
        vendedor_nome,
        foto_documento_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, nome, cpf_cnpj, telefone, endereco, verificado, vendedor_id, vendedor_nome, asaas_id, foto_documento_url, criado_em`,
      [nome, documentoLimpo, telefoneLimpo, endereco, asaasCustomerId, true, parseInt(vendedorId), vendedorNome, fotoUrl]
    );
    
    const clienteCadastrado = resultDb.rows[0];
    
    console.log('[CADASTRO-CLIENTE] Upload de foto concluído');
    console.log('[CADASTRO-CLIENTE] ✅ Cadastro finalizado - ID:', clienteCadastrado.id);
    
    // 5️⃣ RESPOSTA DE SUCESSO
    res.status(200).json({
      sucesso: true,
      mensagem: 'Cliente cadastrado com sucesso',
      cliente: {
        id: clienteCadastrado.id,
        nome: clienteCadastrado.nome,
        documento: clienteCadastrado.cpf_cnpj,
        telefone: clienteCadastrado.telefone,
        endereco: clienteCadastrado.endereco,
        verificado: clienteCadastrado.verificado,
        vendedorId: clienteCadastrado.vendedor_id,
        vendedorNome: clienteCadastrado.vendedor_nome,
        asaasCustomerId: clienteCadastrado.asaas_id,
        fotoDocumentoUrl: clienteCadastrado.foto_documento_url,
        criadoEm: clienteCadastrado.criado_em
      }
    });
    
  } catch (error) {
    console.error('[CADASTRO-CLIENTE] Erro interno:', error);
    
    // ROLLBACK: Tentar remover do Asaas se cadastrou mas falhou no DB
    if (asaasCustomerId) {
      console.log('[CADASTRO-CLIENTE] Tentando rollback no Asaas...');
      try {
        const asaasApi = axios.create({
          baseURL: 'https://api.asaas.com/v3',
          headers: {
            'access_token': process.env.ASAAS_API_KEY
          }
        });
        await asaasApi.delete(`/customers/${asaasCustomerId}`);
        console.log('[CADASTRO-CLIENTE] Rollback no Asaas concluído');
      } catch (rollbackError) {
        console.error('[CADASTRO-CLIENTE] Erro no rollback do Asaas:', rollbackError.message);
      }
    }
    
    // Remover foto se houve erro
    if (fotoPath && fs.existsSync(fotoPath)) {
      try {
        fs.unlinkSync(fotoPath);
      } catch (unlinkError) {
        console.error('[CADASTRO-CLIENTE] Erro ao remover foto:', unlinkError.message);
      }
    }
    
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao processar cadastro'
    });
  }
});

/**
 * @swagger
 * /api/clientes:
 *   get:
 *     summary: Listar todos os clientes
 *     tags: [Clientes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Buscar por nome ou CPF
 *         example: João
 *       - in: query
 *         name: ordem
 *         schema:
 *           type: string
 *           enum: [nome, criado_em, id]
 *         description: Campo para ordenar resultados
 *         example: nome
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Limite de resultados
 *         example: 20
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página
 *         example: 1
 *     responses:
 *       200:
 *         description: Lista de clientes retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 clientes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       nome:
 *                         type: string
 *                       cpf:
 *                         type: string
 *                       telefone:
 *                         type: string
 *                       email:
 *                         type: string
 *                       endereco:
 *                         type: string
 *                       asaasCustomerId:
 *                         type: string
 *                       vendedorId:
 *                         type: integer
 *                       vendedorNome:
 *                         type: string
 *                       criadoEm:
 *                         type: string
 *                         format: date-time
 *                       atualizadoEm:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro no servidor
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { busca, ordem = 'nome', limite = 100, pagina = 1 } = req.query;

    console.log(`[LISTAR-CLIENTES] Parâmetros recebidos:`, { busca, ordem, limite, pagina });

    let query = `
      SELECT 
        id,
        nome,
        cpf_cnpj as cpf,
        telefone,
        email,
        endereco,
        asaas_id as "asaasCustomerId",
        vendedor_id as "vendedorId",
        vendedor_nome as "vendedorNome",
        criado_em as "criadoEm",
        atualizado_em as "atualizadoEm"
      FROM clientes 
      WHERE deletado = false
    `;
    const params = [];
    let paramIndex = 1;

    // Filtro de busca (nome ou CPF)
    if (busca && busca.trim() !== '') {
      const buscaLimpa = busca.replace(/[^\d]/g, ''); // Remove caracteres especiais para busca de CPF
      console.log(`[LISTAR-CLIENTES] Aplicando filtro de busca: "${busca}" (CPF limpo: "${buscaLimpa}")`);
      
      // Se houver números, busca por nome OU CPF. Se não houver, busca apenas por nome
      if (buscaLimpa.length > 0) {
        query += ` AND (nome ILIKE $${paramIndex} OR cpf_cnpj LIKE $${paramIndex + 1})`;
        params.push(`%${busca}%`, `%${buscaLimpa}%`);
        paramIndex += 2;
      } else {
        query += ` AND nome ILIKE $${paramIndex}`;
        params.push(`%${busca}%`);
        paramIndex += 1;
      }
    } else {
      console.log('[LISTAR-CLIENTES] Nenhum filtro de busca aplicado');
    }

    // Ordenação (validação de segurança contra SQL injection)
    const ordensValidas = ['nome', 'criado_em', 'id'];
    const ordemFinal = ordensValidas.includes(ordem) ? ordem : 'nome';
    
    // Converte nome da API para nome da coluna
    const mapeamentoOrdem = {
      'nome': 'nome',
      'criado_em': 'criado_em',
      'criadoEm': 'criado_em',
      'id': 'id'
    };
    
    query += ` ORDER BY ${mapeamentoOrdem[ordemFinal] || 'nome'} ASC`;

    // Paginação
    const limiteInt = Math.min(parseInt(limite) || 100, 500); // Máximo 500
    const paginaInt = Math.max(parseInt(pagina) || 1, 1);
    const offset = (paginaInt - 1) * limiteInt;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limiteInt, offset);

    console.log('[LISTAR-CLIENTES] Query SQL:', query);
    console.log('[LISTAR-CLIENTES] Parâmetros SQL:', params);

    const result = await pool.query(query, params);

    console.log(`[LISTAR-CLIENTES] ✅ Encontrados ${result.rows.length} clientes`);

    res.json({
      sucesso: true,
      clientes: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('[LISTAR-CLIENTES] ❌ Erro:', error);
    res.status(500).json({ 
      sucesso: false,
      mensagem: 'Erro ao buscar clientes'
    });
  }
});

// GET /api/clientes/:id - Buscar cliente por ID local
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM clientes WHERE id = $1 AND deletado = false',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        sucesso: false,
        mensagem: 'Cliente não encontrado' 
      });
    }

    res.json({
      sucesso: true,
      cliente: result.rows[0]
    });
  } catch (error) {
    console.error('[API] Erro ao buscar cliente:', error);
    res.status(500).json({ 
      sucesso: false,
      mensagem: 'Erro ao buscar cliente'
    });
  }
});

// POST /api/clientes/sync - Sincronizar clientes do Asaas
router.post('/sync', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    let offset = 0;
    const limit = 100;
    let totalSincronizados = 0;
    let totalNovos = 0;
    let totalAtualizados = 0;
    let hasMore = true;

    console.log('[SYNC] Iniciando sincronização de clientes...');

    while (hasMore) {
      const dadosAsaas = await listarClientesAsaas({ offset, limit });
      
      for (const clienteAsaas of dadosAsaas.data) {
        const clienteDb = converterClienteAsaasParaDb(clienteAsaas);

        // Verificar se já existe
        const existente = await pool.query(
          'SELECT id FROM clientes WHERE asaas_id = $1',
          [clienteDb.asaas_id]
        );

        if (existente.rows.length > 0) {
          // Atualizar
          await pool.query(`
            UPDATE clientes SET
              nome = $1, email = $2, telefone = $3, celular = $4,
              cpf_cnpj = $5, tipo_pessoa = $6, estrangeiro = $7,
              endereco = $8, numero_endereco = $9, complemento = $10,
              bairro = $11, cidade_id = $12, cidade_nome = $13,
              estado = $14, pais = $15, cep = $16,
              emails_adicionais = $17, referencia_externa = $18,
              notificacoes_desabilitadas = $19, observacoes = $20,
              deletado = $21, data_criacao_asaas = $22
            WHERE asaas_id = $23
          `, [
            clienteDb.nome, clienteDb.email, clienteDb.telefone, clienteDb.celular,
            clienteDb.cpf_cnpj, clienteDb.tipo_pessoa, clienteDb.estrangeiro,
            clienteDb.endereco, clienteDb.numero_endereco, clienteDb.complemento,
            clienteDb.bairro, clienteDb.cidade_id, clienteDb.cidade_nome,
            clienteDb.estado, clienteDb.pais, clienteDb.cep,
            clienteDb.emails_adicionais, clienteDb.referencia_externa,
            clienteDb.notificacoes_desabilitadas, clienteDb.observacoes,
            clienteDb.deletado, clienteDb.data_criacao_asaas,
            clienteDb.asaas_id
          ]);
          totalAtualizados++;
        } else {
          // Inserir novo
          await pool.query(`
            INSERT INTO clientes (
              asaas_id, nome, email, telefone, celular, cpf_cnpj,
              tipo_pessoa, estrangeiro, endereco, numero_endereco,
              complemento, bairro, cidade_id, cidade_nome, estado,
              pais, cep, emails_adicionais, referencia_externa,
              notificacoes_desabilitadas, observacoes, deletado,
              data_criacao_asaas
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
            )
          `, [
            clienteDb.asaas_id, clienteDb.nome, clienteDb.email,
            clienteDb.telefone, clienteDb.celular, clienteDb.cpf_cnpj,
            clienteDb.tipo_pessoa, clienteDb.estrangeiro, clienteDb.endereco,
            clienteDb.numero_endereco, clienteDb.complemento, clienteDb.bairro,
            clienteDb.cidade_id, clienteDb.cidade_nome, clienteDb.estado,
            clienteDb.pais, clienteDb.cep, clienteDb.emails_adicionais,
            clienteDb.referencia_externa, clienteDb.notificacoes_desabilitadas,
            clienteDb.observacoes, clienteDb.deletado, clienteDb.data_criacao_asaas
          ]);
          totalNovos++;
        }
        totalSincronizados++;
      }

      hasMore = dadosAsaas.hasMore;
      offset += limit;

      console.log(`[SYNC] Processados ${totalSincronizados} clientes...`);
    }

    console.log('[SYNC] Sincronização concluída');

    res.json({
      success: true,
      message: 'Sincronização concluída',
      total_sincronizados: totalSincronizados,
      novos: totalNovos,
      atualizados: totalAtualizados
    });
  } catch (error) {
    console.error('[SYNC] Erro na sincronização:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao sincronizar clientes',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/clientes/enviar-verificacao:
 *   post:
 *     summary: Enviar código de verificação para cliente
 *     description: Envia código de verificação via WhatsApp ou SMS através da API AgroChat
 *     tags: [Clientes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nomeCliente
 *               - nomeVendedor
 *               - documento
 *               - telefone
 *               - codigoVerificacao
 *               - metodo
 *             properties:
 *               nomeCliente:
 *                 type: string
 *                 example: "João Silva"
 *               nomeVendedor:
 *                 type: string
 *                 example: "Maria Santos"
 *               documento:
 *                 type: string
 *                 example: "12345678900"
 *               telefone:
 *                 type: string
 *                 example: "11987654321"
 *               endereco:
 *                 type: string
 *                 example: "Rua das Flores, 123"
 *               codigoVerificacao:
 *                 type: string
 *                 example: "123456"
 *               metodo:
 *                 type: string
 *                 enum: [whatsapp, sms]
 *                 example: "whatsapp"
 *     responses:
 *       200:
 *         description: Código enviado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 mensagem:
 *                   type: string
 *                   example: "Código enviado com sucesso"
 *       500:
 *         description: Erro ao enviar código
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/enviar-verificacao', async (req, res) => {
  try {
    const {
      nomeCliente,
      nomeVendedor,
      documento,
      telefone,
      endereco,
      codigoVerificacao,
      metodo
    } = req.body;

    // Validar campos obrigatórios
    if (!nomeCliente || !nomeVendedor || !documento || !telefone || !codigoVerificacao || !metodo) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Campos obrigatórios não preenchidos'
      });
    }

    // Encaminhar para API AgroChat (localhost:8080)
    const agroChatUrl = process.env.AGROCHAT_API_URL || 'http://localhost:8080';
    
    console.log(`[AGROCHAT] Enviando código para ${nomeCliente} via ${metodo}`);
    
    const response = await axios.post(`${agroChatUrl}/enviar-verificacao`, {
      nomeCliente,
      nomeVendedor,
      documento,
      telefone,
      endereco,
      codigoVerificacao,
      metodo
    }, {
      timeout: 30000 // 30 segundos de timeout
    });

    console.log(`[AGROCHAT] Código enviado com sucesso para ${nomeCliente}`);

    res.json({
      sucesso: true,
      mensagem: 'Código enviado com sucesso',
      dados: response.data
    });
  } catch (error) {
    console.error('[AGROCHAT] Erro ao enviar código:', error.message);
    
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar código de verificação',
      erro: error.response?.data || error.message
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

module.exports = router;
