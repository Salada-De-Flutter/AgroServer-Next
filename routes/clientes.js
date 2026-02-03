const express = require('express');
const router = express.Router();
const { listarClientesAsaas } = require('../services/asaas');

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

// GET /api/clientes - Listar clientes do banco local
router.get('/', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { limit = 50, offset = 0, nome, cpf_cnpj, email } = req.query;

    let query = 'SELECT * FROM clientes WHERE deletado = false';
    const params = [];
    let paramIndex = 1;

    if (nome) {
      query += ` AND nome ILIKE $${paramIndex}`;
      params.push(`%${nome}%`);
      paramIndex++;
    }

    if (cpf_cnpj) {
      query += ` AND cpf_cnpj = $${paramIndex}`;
      params.push(cpf_cnpj);
      paramIndex++;
    }

    if (email) {
      query += ` AND email = $${paramIndex}`;
      params.push(email);
      paramIndex++;
    }

    query += ` ORDER BY criado_em DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      data: result.rows
    });
  } catch (error) {
    console.error('[API] Erro ao listar clientes:', error);
    res.status(500).json({ error: 'Erro ao listar clientes', message: error.message });
  }
});

// GET /api/clientes/:id - Buscar cliente por ID local
router.get('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] Erro ao buscar cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar cliente', message: error.message });
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

module.exports = router;
