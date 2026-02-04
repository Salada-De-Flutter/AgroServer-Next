// Carregar variáveis de ambiente baseado em NODE_ENV
const path = require('path')
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
require('dotenv').config({ path: path.resolve(__dirname, envFile) })

const express = require('express')
const cors = require('cors')
const swaggerUi = require('swagger-ui-express')
const gerarSwaggerSpec = require('./docs/swagger')
const { Pool } = require('pg')
const { listarClientesAsaas, listarParcelamentosAsaas, listarCobrancasAsaas } = require('./services/asaas')
const readline = require('readline')

const app = express()
const PORT = process.env.PORT || 3000
const BASE_URL = process.env.API_URL || `http://localhost:${PORT}`
const AMBIENTE = process.env.NODE_ENV || 'development'

// Middlewares
app.use(cors())
app.use(express.json())

// Configuração do banco de dados PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'dev',
  password: process.env.DB_PASSWORD || 'dev',
  database: process.env.DB_NAME || 'devdb',
  port: process.env.DB_PORT || 5432
})

// Disponibilizar pool para as rotas
app.locals.pool = pool

// Variável para controlar sincronização
let sincronizacaoAtiva = false
let cancelarSync = false

// Configurar readline para detectar teclas
readline.emitKeypressEvents(process.stdin)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}

process.stdin.on('keypress', (str, key) => {
  if (key && key.ctrl && key.name === 'c') {
    console.log('\n[INFO] Encerrando servidor...')
    process.exit(0)
  }
  
  if (sincronizacaoAtiva && key) {
    console.log('\n[INFO] Sincronizacao cancelada pelo usuario')
    cancelarSync = true
  }
})

// Teste de conexão do banco
pool.on('connect', () => {
  console.log('[DB] Conectado ao banco PostgreSQL')
})

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no banco:', err)
  process.exit(-1)
})

// ====================
// SINCRONIZACAO
// ====================

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
  }
}

async function sincronizarClientes() {
  if (sincronizacaoAtiva) {
    console.log('[SYNC] Sincronizacao ja em andamento')
    return
  }

  sincronizacaoAtiva = true
  cancelarSync = false
  
  let offset = 0
  const limit = 50 // Reduzido de 100 para 50 para evitar rate limit
  let totalSincronizados = 0
  let totalNovos = 0
  let totalAtualizados = 0
  let totalDeletados = 0
  let hasMore = true
  let clientesAsaasIds = new Set() // Para rastrear IDs que existem no Asaas

  console.log('\n[SYNC] Iniciando sincronizacao...')
  console.log('[SYNC] Pressione qualquer tecla para cancelar\n')

  try {
    while (hasMore && !cancelarSync) {
      console.log(`[SYNC] Buscando clientes no Asaas (offset: ${offset})...`)
      const dadosAsaas = await listarClientesAsaas({ offset, limit })
      console.log(`[SYNC] Recebidos ${dadosAsaas.data.length} clientes do Asaas`)
      
      for (const clienteAsaas of dadosAsaas.data) {
        if (cancelarSync) break
        
        // Rastrear IDs que existem no Asaas
        clientesAsaasIds.add(clienteAsaas.id)
        
        const clienteDb = converterClienteAsaasParaDb(clienteAsaas)

        const existente = await pool.query(
          'SELECT id FROM clientes WHERE asaas_id = $1',
          [clienteDb.asaas_id]
        )

        if (existente.rows.length > 0) {
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
          ])
          console.log(`  [ATUALIZADO] ${clienteDb.nome} (ID: ${clienteDb.asaas_id}) - ${clienteDb.email || 'sem email'}`)
          totalAtualizados++
        } else {
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
          ])
          console.log(`  [NOVO] ${clienteDb.nome} (ID: ${clienteDb.asaas_id}) - ${clienteDb.email || 'sem email'}`)
          totalNovos++
        }
        totalSincronizados++
        
        // Delay de 100ms entre cada cliente para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      hasMore = dadosAsaas.hasMore
      offset += limit

      if (!cancelarSync && hasMore) {
        console.log(`\n[SYNC] Progresso: ${totalSincronizados} clientes | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}`)
        console.log('[SYNC] Aguardando 2 segundos antes da proxima pagina...\n')
        // Delay de 2 segundos entre páginas para respeitar rate limit da API
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Após sincronizar todos os clientes, verificar quais foram deletados do Asaas
    if (!cancelarSync) {
      console.log('\n[SYNC] Verificando clientes deletados do Asaas...')
      
      // Buscar todos os clientes ativos no banco
      const clientesDb = await pool.query(
        'SELECT asaas_id, nome FROM clientes WHERE deletado = false'
      )
      
      for (const clienteDb of clientesDb.rows) {
        if (cancelarSync) break
        
        // Se o cliente existe no banco mas não foi encontrado no Asaas, marcar como deletado
        if (!clientesAsaasIds.has(clienteDb.asaas_id)) {
          await pool.query(
            'UPDATE clientes SET deletado = true WHERE asaas_id = $1',
            [clienteDb.asaas_id]
          )
          console.log(`  [DELETADO] ${clienteDb.nome} (ID: ${clienteDb.asaas_id}) - removido do Asaas`)
          totalDeletados++
        }
      }
    }

    if (cancelarSync) {
      console.log('\n[SYNC] Sincronizacao cancelada')
      console.log(`[SYNC] Processados ate cancelamento: ${totalSincronizados}`)
    } else {
      console.log('\n[SYNC] Sincronizacao concluida!')
      console.log(`[SYNC] Total: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados} | Deletados: ${totalDeletados}\n`)
    }
  } catch (error) {
    console.error('[SYNC] Erro na sincronizacao:', error.message)
  } finally {
    sincronizacaoAtiva = false
    cancelarSync = false
  }
}

// Sincronização de Parcelamentos
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

async function sincronizarParcelamentos() {
  if (sincronizacaoAtiva) {
    console.log('[PARCELAMENTOS] Sincronizacao ja em andamento')
    return
  }

  sincronizacaoAtiva = true
  cancelarSync = false
  
  let offset = 0
  const limit = 50
  let totalSincronizados = 0
  let totalNovos = 0
  let totalAtualizados = 0
  let hasMore = true

  console.log('\n[PARCELAMENTOS] Iniciando sincronizacao...')
  console.log('[PARCELAMENTOS] Pressione qualquer tecla para cancelar\n')

  try {
    while (hasMore && !cancelarSync) {
      console.log(`[PARCELAMENTOS] Buscando no Asaas (offset: ${offset})...`)
      const dadosAsaas = await listarParcelamentosAsaas({ offset, limit })
      console.log(`[PARCELAMENTOS] Recebidos ${dadosAsaas.data.length} parcelamentos`)
      
      for (const parcelamentoAsaas of dadosAsaas.data) {
        if (cancelarSync) break
        
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
          console.log(`  [ATUALIZADO] ${parcelamentoDb.asaas_id} - ${parcelamentoDb.descricao || 'sem descrição'}`)
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
          console.log(`  [NOVO] ${parcelamentoDb.asaas_id} - ${parcelamentoDb.descricao || 'sem descrição'}`)
          totalNovos++
        }
        totalSincronizados++
        
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      hasMore = dadosAsaas.hasMore
      offset += limit

      if (!cancelarSync && hasMore) {
        console.log(`\n[PARCELAMENTOS] Progresso: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}`)
        console.log('[PARCELAMENTOS] Aguardando 2 segundos...\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    if (cancelarSync) {
      console.log('\n[PARCELAMENTOS] Sincronizacao cancelada')
      console.log(`[PARCELAMENTOS] Processados ate cancelamento: ${totalSincronizados}`)
    } else {
      console.log('\n[PARCELAMENTOS] Sincronizacao concluida!')
      console.log(`Total: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}\n`)
    }
  } catch (error) {
    console.error('[PARCELAMENTOS] Erro na sincronizacao:', error.message)
  } finally {
    sincronizacaoAtiva = false
    cancelarSync = false
  }
}

// Sincronização de Cobranças
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

async function sincronizarCobrancas() {
  if (sincronizacaoAtiva) {
    console.log('[COBRANCAS] Sincronizacao ja em andamento')
    return
  }

  sincronizacaoAtiva = true
  cancelarSync = false
  
  let offset = 0
  const limit = 50
  let totalSincronizados = 0
  let totalNovos = 0
  let totalAtualizados = 0
  let hasMore = true

  console.log('\n[COBRANCAS] Iniciando sincronizacao...')
  console.log('[COBRANCAS] Pressione qualquer tecla para cancelar\n')

  try {
    while (hasMore && !cancelarSync) {
      console.log(`[COBRANCAS] Buscando no Asaas (offset: ${offset})...`)
      const dadosAsaas = await listarCobrancasAsaas({ offset, limit })
      console.log(`[COBRANCAS] Recebidas ${dadosAsaas.data.length} cobranças`)

      for (const cobrancaAsaas of dadosAsaas.data) {
        if (cancelarSync) break
        
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
          console.log(`  [ATUALIZADO] ${cobrancaDb.asaas_id} - ${cobrancaDb.status} - R$ ${cobrancaDb.valor}`)
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
              $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43
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
          console.log(`  [NOVO] ${cobrancaDb.asaas_id} - ${cobrancaDb.status} - R$ ${cobrancaDb.valor}`)
          totalNovos++
        }
        totalSincronizados++
        
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      hasMore = dadosAsaas.hasMore
      offset += limit

      if (!cancelarSync && hasMore) {
        console.log(`\n[COBRANCAS] Progresso: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}`)
        console.log('[COBRANCAS] Aguardando 2 segundos...\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    if (cancelarSync) {
      console.log('\n[COBRANCAS] Sincronizacao cancelada')
      console.log(`[COBRANCAS] Processados ate cancelamento: ${totalSincronizados}`)
    } else {
      console.log('\n[COBRANCAS] Sincronizacao concluida!')
      console.log(`Total: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}\n`)
    }
  } catch (error) {
    console.error('[COBRANCAS] Erro na sincronizacao:', error.message)
  } finally {
    sincronizacaoAtiva = false
    cancelarSync = false
  }
}

// Função para executar todas as sincronizações em sequência
async function sincronizarTudo() {
  console.log('\n[INFO] SINCRONIZACAO COMPLETA - INICIANDO\n')
  
  // 1. Sincronizar clientes
  await sincronizarClientes()
  
  if (cancelarSync) {
    console.log('\n[INFO] Sincronizacao geral cancelada pelo usuario')
    return
  }
  
  // 2. Aguardar 10 segundos e sincronizar parcelamentos
  console.log('\n[INFO] Aguardando 10 segundos para sincronizar parcelamentos...\n')
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  if (cancelarSync) {
    console.log('\n[INFO] Sincronizacao geral cancelada pelo usuario')
    return
  }
  
  await sincronizarParcelamentos()
  
  if (cancelarSync) {
    console.log('\n[INFO] Sincronizacao geral cancelada pelo usuario')
    return
  }
  
  // 3. Aguardar 10 segundos e sincronizar cobranças
  console.log('\n[INFO] Aguardando 10 segundos para sincronizar cobrancas...\n')
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  if (cancelarSync) {
    console.log('\n[INFO] Sincronizacao geral cancelada pelo usuario')
    return
  }
  
  await sincronizarCobrancas()
  
  console.log('\n[INFO] SINCRONIZACAO COMPLETA - FINALIZADA\n')
}

// ====================
// ROTAS
// ====================

// Importar rotas
const clientesRoutes = require('./routes/clientes')
const parcelamentosRoutes = require('./routes/parcelamentos')
const cobrancasRoutes = require('./routes/cobrancas')
const authRoutes = require('./routes/auth')

/**
 * @swagger
 * /:
 *   get:
 *     summary: Informações da API
 *     description: Retorna informações básicas da API e endpoints disponíveis
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Informações da API retornadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "AgroServer API - Sistema Agrícola"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     health:
 *                       type: string
 *                       example: "/health"
 *                     auth:
 *                       type: string
 *                       example: "/api/auth"
 *                     clientes:
 *                       type: string
 *                       example: "/api/clientes"
 *                     parcelamentos:
 *                       type: string
 *                       example: "/api/parcelamentos"
 *                     cobrancas:
 *                       type: string
 *                       example: "/api/cobrancas"
 *                     docs:
 *                       type: string
 *                       example: "/api-docs"
 */
app.get('/', (req, res) => {
  res.json({
    message: 'AgroServer API - Sistema Agrícola',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      clientes: '/api/clientes',
      parcelamentos: '/api/parcelamentos',
      cobrancas: '/api/cobrancas',
      docs: '/api-docs'
    }
  })
})

/**
 * @swagger
 * /api/exemplo:
 *   get:
 *     summary: Exemplo de endpoint da API
 *     description: Endpoint de teste que retorna informações do PostgreSQL
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Resposta de exemplo com versão do PostgreSQL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Endpoint de exemplo funcionando"
 *                 pg_version:
 *                   type: string
 *                   example: "PostgreSQL 16.0"
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/exemplo', async (req, res) => {
  try {
    // Exemplo de consulta simples
    const result = await pool.query('SELECT version()')
    res.json({
      message: 'Endpoint de exemplo funcionando',
      pg_version: result.rows[0].version
    })
  } catch (error) {
    res.status(500).json({
      error: 'Erro ao processar requisição',
      message: error.message
    })
  }
})

// Registrar rotas
app.use('/api/auth', authRoutes)
app.use('/api/clientes', clientesRoutes)
app.use('/api/parcelamentos', parcelamentosRoutes)
app.use('/api/cobrancas', cobrancasRoutes)

// Tratamento de rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.path
  })
})

// Tratamento global de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err.stack)
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro ao processar sua requisição'
  })
})

// Iniciar servidor
async function iniciarServidor() {
  // Configurar Swagger dinamicamente baseado no ambiente
  const swaggerSpec = gerarSwaggerSpec(AMBIENTE === 'production' ? 'prod' : 'dev', BASE_URL)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'AgroServer API Documentation'
  }))
  
  // Log de debug para confirmar rota registrada
  console.log('[DEBUG] Rota /api-docs registrada')
  
  app.listen(PORT, async () => {
    console.log('\n[SERVER] AGROSERVER API - INICIANDO\n')
    
    console.log(`[SERVER] Ambiente: ${AMBIENTE.toUpperCase()}`)
    console.log(`[SERVER] URL Base: ${BASE_URL}`)
    console.log(`[SERVER] Porta: ${PORT}`)
    console.log(`[SERVER] Escutando em: http://localhost:${PORT}`)
  
  // 1. Verificar conexão com banco
  try {
    console.log('\n[1/2] Verificando conexao com banco de dados...')
    await pool.query('SELECT 1')
    console.log('[OK] Banco de dados conectado')
  } catch (error) {
    console.error('[ERRO] Falha ao conectar no banco:', error.message)
    process.exit(1)
  }
  
  // 2. Verificar conexão com Asaas
  try {
    console.log('\n[2/2] Verificando conexao com API Asaas...')
    console.log(`[DEBUG] ASAAS_API_KEY carregada: ${process.env.ASAAS_API_KEY ? process.env.ASAAS_API_KEY.substring(0, 20) + '...' : 'NAO ENCONTRADA'}`)
    await listarClientesAsaas({ limit: 1 })
    console.log('[OK] API Asaas conectada')
  } catch (error) {
    console.error('[ERRO] Falha ao conectar na API Asaas:', error.message)
    console.error('[ERRO] Verifique a chave ASAAS_API_KEY no .env')
    process.exit(1)
  }
  
  console.log('\n[OK] Servidor pronto!\n')
  console.log(`[SWAGGER] Documentacao da API: ${BASE_URL}/api-docs\n`)
  
  // 3. Perguntar se deseja sincronizar
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  rl.question('[SYNC] Deseja iniciar sincronizacao completa? (S/N): ', (resposta) => {
    rl.close()
    
    if (resposta.trim().toLowerCase() === 's' || resposta.trim().toLowerCase() === 'sim') {
      console.log('\n[INFO] Iniciando sincronizacao completa...')
      console.log('[INFO] Pressione qualquer tecla para cancelar sincronizacao')
      console.log('[INFO] Pressione Ctrl+C para encerrar o servidor\n')
      sincronizarTudo()
    } else {
      console.log('\n[INFO] Sincronizacao nao sera executada')
      console.log('[INFO] Pressione Ctrl+C para encerrar o servidor\n')
    }
  })
  })
}

// Iniciar aplicação
iniciarServidor()
