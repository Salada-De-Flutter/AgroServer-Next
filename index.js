
require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json())

const pool = new Pool({
  host: 'localhost',
  user: 'dev',
  password: 'dev',
  database: 'devdb',
  port: 5432
})


app.get('/', async (req, res) => {
  const result = await pool.query('SELECT NOW()')
  res.json({
    status: 'ok',
    db_time: result.rows[0]
  })
})

app.listen(3000, () => {
  console.log('🔥 Backend rodando na porta 3000')
})
