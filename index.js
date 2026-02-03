require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')

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

// Teste de conexão do banco
pool.on('connect', () => {
  console.log('[DB] Conectado ao banco PostgreSQL')
})

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no banco:', err)
  process.exit(-1)
})

// ====================
// ROTAS
// ====================

// Health check
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()')
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      db_time: result.rows[0].now
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Falha ao conectar com o banco de dados',
      error: error.message
    })
  }
})

// Rota raiz
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
app.listen(PORT, () => {
  console.log(`[SERVER] Rodando em http://localhost:${PORT}`)
  console.log(`[SERVER] Health check: http://localhost:${PORT}/health`)
  console.log(`[SERVER] Modo: ${process.env.NODE_ENV || 'development'}`)
})
