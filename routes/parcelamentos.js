const express = require('express')
const router = express.Router()
const { listarParcelamentosAsaas, buscarParcelamentoAsaas } = require('../services/asaas')

/**
 * @swagger
 * tags:
 *   name: Parcelamentos
 *   description: Endpoints para gerenciamento de parcelamentos sincronizados do Asaas
 */

// Função para converter parcelamento do Asaas para formato do DB
function converterParcelamentoAsaasParaDb(parcelamentoAsaas) {
  return {
    asaas_id: parcelamentoAsaas.id,
    valor: parcelamentoAsaas.value,
    valor_liquido: parcelamentoAsaas.netValue,
    valor_parcela: parcelamentoAsaas.paymentValue,
    numero_parcelas: parcelamentoAsaas.installmentCount,
    forma_pagamento: parcelamentoAsaas.billingType,
    data_pagamento: parcelamentoAsaas.paymentDate,
    descricao: parcelamentoAsaas.description,
    dia_vencimento: parcelamentoAsaas.expirationDay,
    data_criacao_asaas: parcelamentoAsaas.dateCreated,
    cliente_asaas_id: parcelamentoAsaas.customer,
    payment_link: parcelamentoAsaas.paymentLink,
    checkout_session: parcelamentoAsaas.checkoutSession,
    url_comprovante: parcelamentoAsaas.transactionReceiptUrl,
    cartao_ultimos_digitos: parcelamentoAsaas.creditCard?.creditCardNumber,
    cartao_bandeira: parcelamentoAsaas.creditCard?.creditCardBrand,
    cartao_token: parcelamentoAsaas.creditCard?.creditCardToken,
    deletado: parcelamentoAsaas.deleted || false
  }
}

/**
 * @swagger
 * /api/parcelamentos:
 *   get:
 *     summary: Listar parcelamentos
 *     description: Retorna lista paginada de parcelamentos sincronizados do Asaas
 *     tags: [Parcelamentos]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Número máximo de parcelamentos por página
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Número de parcelamentos para pular
 *       - in: query
 *         name: cliente
 *         schema:
 *           type: string
 *         description: Filtrar por ID do cliente no Asaas
 *     responses:
 *       200:
 *         description: Lista de parcelamentos retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Parcelamento'
 *                 limit:
 *                   type: integer
 *                   example: 50
 *                 offset:
 *                   type: integer
 *                   example: 0
 *                 total:
 *                   type: integer
 *                   example: 25
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    const { limit = 50, offset = 0, cliente } = req.query

    let query = 'SELECT * FROM parcelamentos WHERE 1=1'
    const params = []
    let paramCount = 1

    if (cliente) {
      query += ` AND cliente_asaas_id = $${paramCount}`
      params.push(cliente)
      paramCount++
    }

    query += ' ORDER BY data_criacao_asaas DESC'
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`
    params.push(limit, offset)

    const result = await pool.query(query, params)

    res.json({
      data: result.rows,
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: result.rowCount
    })
  } catch (error) {
    console.error('[PARCELAMENTOS] Erro ao listar:', error)
    res.status(500).json({ error: 'Erro ao listar parcelamentos' })
  }
})

// GET /api/parcelamentos/:id - Buscar parcelamento específico
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM parcelamentos WHERE id = $1 OR asaas_id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parcelamento não encontrado' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('[PARCELAMENTOS] Erro ao buscar:', error)
    res.status(500).json({ error: 'Erro ao buscar parcelamento' })
  }
})

// POST /api/parcelamentos/sync - Sincronizar parcelamentos do Asaas
router.post('/sync', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    let offset = 0
    const limit = 50
    let totalSincronizados = 0
    let totalNovos = 0
    let totalAtualizados = 0
    let hasMore = true

    console.log('\n[PARCELAMENTOS] Iniciando sincronização...')

    while (hasMore) {
      console.log(`[PARCELAMENTOS] Buscando no Asaas (offset: ${offset})...`)
      const dadosAsaas = await listarParcelamentosAsaas({ offset, limit })
      console.log(`[PARCELAMENTOS] Recebidos ${dadosAsaas.data.length} parcelamentos`)

      for (const parcelamentoAsaas of dadosAsaas.data) {
        const parcelamentoDb = converterParcelamentoAsaasParaDb(parcelamentoAsaas)

        const existente = await pool.query(
          'SELECT id FROM parcelamentos WHERE asaas_id = $1',
          [parcelamentoDb.asaas_id]
        )

        if (existente.rows.length > 0) {
          await pool.query(`
            UPDATE parcelamentos SET
              valor = $1, valor_liquido = $2, valor_parcela = $3,
              numero_parcelas = $4, forma_pagamento = $5, data_pagamento = $6,
              descricao = $7, dia_vencimento = $8, data_criacao_asaas = $9,
              cliente_asaas_id = $10, payment_link = $11, checkout_session = $12,
              url_comprovante = $13, cartao_ultimos_digitos = $14,
              cartao_bandeira = $15, cartao_token = $16, deletado = $17
            WHERE asaas_id = $18
          `, [
            parcelamentoDb.valor, parcelamentoDb.valor_liquido, parcelamentoDb.valor_parcela,
            parcelamentoDb.numero_parcelas, parcelamentoDb.forma_pagamento, parcelamentoDb.data_pagamento,
            parcelamentoDb.descricao, parcelamentoDb.dia_vencimento, parcelamentoDb.data_criacao_asaas,
            parcelamentoDb.cliente_asaas_id, parcelamentoDb.payment_link, parcelamentoDb.checkout_session,
            parcelamentoDb.url_comprovante, parcelamentoDb.cartao_ultimos_digitos,
            parcelamentoDb.cartao_bandeira, parcelamentoDb.cartao_token, parcelamentoDb.deletado,
            parcelamentoDb.asaas_id
          ])
          console.log(`  [ATUALIZADO] Parcelamento ${parcelamentoDb.asaas_id} - ${parcelamentoDb.descricao || 'sem descrição'}`)
          totalAtualizados++
        } else {
          await pool.query(`
            INSERT INTO parcelamentos (
              asaas_id, valor, valor_liquido, valor_parcela, numero_parcelas,
              forma_pagamento, data_pagamento, descricao, dia_vencimento,
              data_criacao_asaas, cliente_asaas_id, payment_link, checkout_session,
              url_comprovante, cartao_ultimos_digitos, cartao_bandeira,
              cartao_token, deletado
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18
            )
          `, [
            parcelamentoDb.asaas_id, parcelamentoDb.valor, parcelamentoDb.valor_liquido,
            parcelamentoDb.valor_parcela, parcelamentoDb.numero_parcelas, parcelamentoDb.forma_pagamento,
            parcelamentoDb.data_pagamento, parcelamentoDb.descricao, parcelamentoDb.dia_vencimento,
            parcelamentoDb.data_criacao_asaas, parcelamentoDb.cliente_asaas_id, parcelamentoDb.payment_link,
            parcelamentoDb.checkout_session, parcelamentoDb.url_comprovante, parcelamentoDb.cartao_ultimos_digitos,
            parcelamentoDb.cartao_bandeira, parcelamentoDb.cartao_token, parcelamentoDb.deletado
          ])
          console.log(`  [NOVO] Parcelamento ${parcelamentoDb.asaas_id} - ${parcelamentoDb.descricao || 'sem descrição'}`)
          totalNovos++
        }
        totalSincronizados++

        // Delay de 100ms entre cada parcelamento
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      hasMore = dadosAsaas.hasMore
      offset += limit

      if (hasMore) {
        console.log(`\n[PARCELAMENTOS] Progresso: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}`)
        console.log('[PARCELAMENTOS] Aguardando 2 segundos...\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log('\n[PARCELAMENTOS] Sincronização concluída!')
    console.log(`Total: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}\n`)

    res.json({
      success: true,
      total: totalSincronizados,
      novos: totalNovos,
      atualizados: totalAtualizados
    })
  } catch (error) {
    console.error('[PARCELAMENTOS] Erro ao sincronizar:', error)
    res.status(500).json({ error: 'Erro ao sincronizar parcelamentos' })
  }
})

module.exports = router
