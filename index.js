require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const { listarClientesAsaas } = require('./services/asaas')
const readline = require('readline')

const app = express()
const PORT = process.env.PORT || 3000

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
  let hasMore = true

  console.log('\n========================================')
  console.log('[SYNC] Iniciando sincronizacao...')
  console.log('[SYNC] Pressione qualquer tecla para cancelar')
  console.log('========================================\n')

  try {
    while (hasMore && !cancelarSync) {
      console.log(`[SYNC] Buscando clientes no Asaas (offset: ${offset})...`)
      const dadosAsaas = await listarClientesAsaas({ offset, limit })
      console.log(`[SYNC] Recebidos ${dadosAsaas.data.length} clientes do Asaas`)
      
      for (const clienteAsaas of dadosAsaas.data) {
        if (cancelarSync) break
        
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

    if (cancelarSync) {
      console.log('\n[SYNC] Sincronizacao cancelada')
      console.log(`[SYNC] Processados ate cancelamento: ${totalSincronizados}`)
    } else {
      console.log('\n========================================')
      console.log('[SYNC] Sincronizacao concluida!')
      console.log(`[SYNC] Total: ${totalSincronizados} | Novos: ${totalNovos} | Atualizados: ${totalAtualizados}`)
      console.log('========================================\n')
    }
  } catch (error) {
    console.error('[SYNC] Erro na sincronizacao:', error.message)
  } finally {
    sincronizacaoAtiva = false
    cancelarSync = false
  }
}

// ====================
// ROTAS
// ====================

// Importar rotas
const clientesRoutes = require('./routes/clientes')

// Usar rotas
app.use('/api/clientes', clientesRoutes)
app.get('/', (req, res) => {
  res.json({
    message: 'AgroServer API - Sistema Agrícola',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api'
    }
  })
})

// Exemplo de rota API
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
app.listen(PORT, async () => {
  console.log('\n========================================')
  console.log('AGROSERVER API - INICIANDO')
  console.log('========================================\n')
  
  console.log(`[SERVER] Rodando em http://localhost:${PORT}`)
  console.log(`[SERVER] Modo: ${process.env.NODE_ENV || 'development'}`)
  
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
    await listarClientesAsaas({ limit: 1 })
    console.log('[OK] API Asaas conectada')
  } catch (error) {
    console.error('[ERRO] Falha ao conectar na API Asaas:', error.message)
    console.error('[ERRO] Verifique a chave ASAAS_API_KEY no .env')
    process.exit(1)
  }
  
  console.log('\n========================================')
  console.log('[OK] Servidor pronto!')
  console.log('========================================\n')
  
  // 3. Aguardar 15 segundos e iniciar sincronização
  console.log('[INFO] Sincronizacao automatica iniciara em 15 segundos...')
  console.log('[INFO] Pressione Ctrl+C para encerrar o servidor\n')
  
  setTimeout(() => {
    sincronizarClientes()
  }, 15000)
})
