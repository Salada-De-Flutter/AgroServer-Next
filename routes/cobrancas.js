const express = require('express')
const router = express.Router()
const { listarCobrancasAsaas, buscarCobrancaAsaas } = require('../services/asaas')

/**
 * @swagger
 * tags:
 *   name: Cobranças
 *   description: Endpoints para gerenciamento de cobranças sincronizadas do Asaas
 */

// Função para converter cobrança do Asaas para formato do DB
function converterCobrancaAsaasParaDb(cobrancaAsaas) {
  return {
    asaas_id: cobrancaAsaas.id,
    valor: cobrancaAsaas.value,
    valor_liquido: cobrancaAsaas.netValue,
    valor_original: cobrancaAsaas.originalValue,
    valor_juros: cobrancaAsaas.interestValue,
    descricao: cobrancaAsaas.description,
    forma_pagamento: cobrancaAsaas.billingType,
    status: cobrancaAsaas.status,
    data_criacao_asaas: cobrancaAsaas.dateCreated,
    data_vencimento: cobrancaAsaas.dueDate,
    data_vencimento_original: cobrancaAsaas.originalDueDate,
    data_pagamento: cobrancaAsaas.paymentDate,
    data_pagamento_cliente: cobrancaAsaas.clientPaymentDate,
    data_credito: cobrancaAsaas.creditDate,
    data_credito_estimada: cobrancaAsaas.estimatedCreditDate,
    cliente_asaas_id: cobrancaAsaas.customer,
    assinatura_id: cobrancaAsaas.subscription,
    parcelamento_id: cobrancaAsaas.installment,
    numero_parcela: cobrancaAsaas.installmentNumber,
    checkout_session: cobrancaAsaas.checkoutSession,
    payment_link: cobrancaAsaas.paymentLink,
    url_fatura: cobrancaAsaas.invoiceUrl,
    numero_fatura: cobrancaAsaas.invoiceNumber,
    referencia_externa: cobrancaAsaas.externalReference,
    nosso_numero: cobrancaAsaas.nossoNumero,
    url_boleto: cobrancaAsaas.bankSlipUrl,
    pode_pagar_apos_vencimento: cobrancaAsaas.canBePaidAfterDueDate,
    pix_transacao_id: cobrancaAsaas.pixTransaction,
    pix_qrcode_id: cobrancaAsaas.pixQrCodeId,
    cartao_ultimos_digitos: cobrancaAsaas.creditCard?.creditCardNumber,
    cartao_bandeira: cobrancaAsaas.creditCard?.creditCardBrand,
    cartao_token: cobrancaAsaas.creditCard?.creditCardToken,
    url_comprovante: cobrancaAsaas.transactionReceiptUrl,
    desconto_valor: cobrancaAsaas.discount?.value,
    desconto_dias_limite: cobrancaAsaas.discount?.dueDateLimitDays,
    desconto_tipo: cobrancaAsaas.discount?.type,
    multa_percentual: cobrancaAsaas.fine?.value,
    juros_percentual: cobrancaAsaas.interest?.value,
    deletado: cobrancaAsaas.deleted || false,
    antecipado: cobrancaAsaas.anticipated || false,
    antecipavel: cobrancaAsaas.anticipable || false,
    envio_correios: cobrancaAsaas.postalService || false,
    dias_apos_vencimento_para_cancelamento: cobrancaAsaas.daysAfterDueDateToRegistrationCancellation
  }
}

// GET /api/cobrancas - Listar todas as cobranças do banco
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    const { limit = 50, offset = 0, cliente, status, forma_pagamento, parcelamento } = req.query

    let query = 'SELECT * FROM cobrancas WHERE 1=1'
    const params = []
    let paramCount = 1

    if (cliente) {
      query += ` AND cliente_asaas_id = $${paramCount}`
      params.push(cliente)
      paramCount++
    }

    if (status) {
      query += ` AND status = $${paramCount}`
      params.push(status)
      paramCount++
    }

    if (forma_pagamento) {
      query += ` AND forma_pagamento = $${paramCount}`
      params.push(forma_pagamento)
      paramCount++
    }

    if (parcelamento) {
      query += ` AND parcelamento_id = $${paramCount}`
      params.push(parcelamento)
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
    console.error('[COBRANCAS] Erro ao listar:', error)
    res.status(500).json({ error: 'Erro ao listar cobranças' })
  }
})

// GET /api/cobrancas/:id - Buscar cobrança específica
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    const { id } = req.params

    const result = await pool.query(
      'SELECT * FROM cobrancas WHERE id = $1 OR asaas_id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cobrança não encontrada' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('[COBRANCAS] Erro ao buscar:', error)
    res.status(500).json({ error: 'Erro ao buscar cobrança' })
  }
})

// POST /api/cobrancas/sync - Sincronizar cobranças do Asaas
router.post('/sync', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    let offset = 0
    const limit = 50
    let totalSincronizados = 0
    let totalNovos = 0
    let totalAtualizados = 0
    let hasMore = true

    console.log('\n[COBRANCAS] Iniciando sincronização...')

    while (hasMore) {
      console.log(`[COBRANCAS] Buscando no Asaas (offset: ${offset})...`)
      const dadosAsaas = await listarCobrancasAsaas({ offset, limit })
      console.log(`[COBRANCAS] Recebidas ${dadosAsaas.data.length} cobranças`)

      for (const cobrancaAsaas of dadosAsaas.data) {
        const cobrancaDb = converterCobrancaAsaasParaDb(cobrancaAsaas)

        const existente = await pool.query(
          'SELECT id FROM cobrancas WHERE asaas_id = $1',
          [cobrancaDb.asaas_id]
        )

        if (existente.rows.length > 0) {
          await pool.query(`
            UPDATE cobrancas SET
              valor = $1, valor_liquido = $2, valor_original = $3, valor_juros = $4,
              descricao = $5, forma_pagamento = $6, status = $7, data_criacao_asaas = $8,
              data_vencimento = $9, data_vencimento_original = $10, data_pagamento = $11,
              data_pagamento_cliente = $12, data_credito = $13, data_credito_estimada = $14,
              cliente_asaas_id = $15, assinatura_id = $16, parcelamento_id = $17,
              numero_parcela = $18, checkout_session = $19, payment_link = $20,
              url_fatura = $21, numero_fatura = $22, referencia_externa = $23,
              nosso_numero = $24, url_boleto = $25, pode_pagar_apos_vencimento = $26,
              pix_transacao_id = $27, pix_qrcode_id = $28, cartao_ultimos_digitos = $29,
              cartao_bandeira = $30, cartao_token = $31, url_comprovante = $32,
              desconto_valor = $33, desconto_dias_limite = $34, desconto_tipo = $35,
              multa_percentual = $36, juros_percentual = $37, deletado = $38,
              antecipado = $39, antecipavel = $40, envio_correios = $41,
              dias_apos_vencimento_para_cancelamento = $42
            WHERE asaas_id = $43
          `, [
            cobrancaDb.valor, cobrancaDb.valor_liquido, cobrancaDb.valor_original, cobrancaDb.valor_juros,
            cobrancaDb.descricao, cobrancaDb.forma_pagamento, cobrancaDb.status, cobrancaDb.data_criacao_asaas,
            cobrancaDb.data_vencimento, cobrancaDb.data_vencimento_original, cobrancaDb.data_pagamento,
            cobrancaDb.data_pagamento_cliente, cobrancaDb.data_credito, cobrancaDb.data_credito_estimada,
            cobrancaDb.cliente_asaas_id, cobrancaDb.assinatura_id, cobrancaDb.parcelamento_id,
            cobrancaDb.numero_parcela, cobrancaDb.checkout_session, cobrancaDb.payment_link,
            cobrancaDb.url_fatura, cobrancaDb.numero_fatura, cobrancaDb.referencia_externa,
            cobrancaDb.nosso_numero, cobrancaDb.url_boleto, cobrancaDb.pode_pagar_apos_vencimento,
            cobrancaDb.pix_transacao_id, cobrancaDb.pix_qrcode_id, cobrancaDb.cartao_ultimos_digitos,
            cobrancaDb.cartao_bandeira, cobrancaDb.cartao_token, cobrancaDb.url_comprovante,
            cobrancaDb.desconto_valor, cobrancaDb.desconto_dias_limite, cobrancaDb.desconto_tipo,
            cobrancaDb.multa_percentual, cobrancaDb.juros_percentual, cobrancaDb.deletado,
            cobrancaDb.antecipado, cobrancaDb.antecipavel, cobrancaDb.envio_correios,
            cobrancaDb.dias_apos_vencimento_para_cancelamento,
            cobrancaDb.asaas_id
          ])
          console.log(`  [ATUALIZADO] ${cobrancaDb.asaas_id} - ${cobrancaDb.status} - R$ ${cobrancaDb.valor} - ${cobrancaDb.descricao || 'sem descrição'}`)
          totalAtualizados++
        } else {
          await pool.query(`
            INSERT INTO cobrancas (
              asaas_id, valor, valor_liquido, valor_original, valor_juros,
              descricao, forma_pagamento, status, data_criacao_asaas,
              data_vencimento, data_vencimento_original, data_pagamento,
              data_pagamento_cliente, data_credito, data_credito_estimada,
              cliente_asaas_id, assinatura_id, parcelamento_id, numero_parcela,
              checkout_session, payment_link, url_fatura, numero_fatura,
              referencia_externa, nosso_numero, url_boleto, pode_pagar_apos_vencimento,
              pix_transacao_id, pix_qrcode_id, cartao_ultimos_digitos,
              cartao_bandeira, cartao_token, url_comprovante, desconto_valor,
              desconto_dias_limite, desconto_tipo, multa_percentual, juros_percentual,
              deletado, antecipado, antecipavel, envio_correios,
              dias_apos_vencimento_para_cancelamento
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
              $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42
            )
          `, [
            cobrancaDb.asaas_id, cobrancaDb.valor, cobrancaDb.valor_liquido, cobrancaDb.valor_original,
            cobrancaDb.valor_juros, cobrancaDb.descricao, cobrancaDb.forma_pagamento, cobrancaDb.status,
            cobrancaDb.data_criacao_asaas, cobrancaDb.data_vencimento, cobrancaDb.data_vencimento_original,
            cobrancaDb.data_pagamento, cobrancaDb.data_pagamento_cliente, cobrancaDb.data_credito,
            cobrancaDb.data_credito_estimada, cobrancaDb.cliente_asaas_id, cobrancaDb.assinatura_id,
            cobrancaDb.parcelamento_id, cobrancaDb.numero_parcela, cobrancaDb.checkout_session,
            cobrancaDb.payment_link, cobrancaDb.url_fatura, cobrancaDb.numero_fatura,
            cobrancaDb.referencia_externa, cobrancaDb.nosso_numero, cobrancaDb.url_boleto,
            cobrancaDb.pode_pagar_apos_vencimento, cobrancaDb.pix_transacao_id, cobrancaDb.pix_qrcode_id,
            cobrancaDb.cartao_ultimos_digitos, cobrancaDb.cartao_bandeira, cobrancaDb.cartao_token,
            cobrancaDb.url_comprovante, cobrancaDb.desconto_valor, cobrancaDb.desconto_dias_limite,
            cobrancaDb.desconto_tipo, cobrancaDb.multa_percentual, cobrancaDb.juros_percentual,
            cobrancaDb.deletado, cobrancaDb.antecipado, cobrancaDb.antecipavel, cobrancaDb.envio_correios,
            cobrancaDb.dias_apos_vencimento_para_cancelamento
          ])
          console.log(`  [NOVO] ${cobrancaDb.asaas_id} - ${cobrancaDb.status} - R$ ${cobrancaDb.valor} - ${cobrancaDb.descricao || 'sem descrição'}`)
          totalNovos++
        }
        totalSincronizados++

        // Delay de 100ms entre cada cobrança
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      hasMore = dadosAsaas.hasMore
      offset += limit

      if (hasMore) {
        console.log(`\n[COBRANCAS] Progresso: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}`)
        console.log('[COBRANCAS] Aguardando 2 segundos...\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log('\n[COBRANCAS] Sincronização concluída!')
    console.log(`Total: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}\n`)

    res.json({
      success: true,
      total: totalSincronizados,
      novos: totalNovos,
      atualizados: totalAtualizados
    })
  } catch (error) {
    console.error('[COBRANCAS] Erro ao sincronizar:', error)
    res.status(500).json({ error: 'Erro ao sincronizar cobranças' })
  }
})

module.exports = router
