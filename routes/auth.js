const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const validator = require('validator')
const router = express.Router()

/**
 * @swagger
 * tags:
 *   name: Autenticação
 *   description: Endpoints para autenticação e gerenciamento de usuários
 */

// Função para gerar token JWT
const gerarToken = (usuario) => {
  return jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      tipo: usuario.tipo_usuario
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  )
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Cadastrar novo usuário
 *     description: Cria um novo usuário no sistema
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - email
 *               - senha
 *             properties:
 *               nome:
 *                 type: string
 *                 example: "João Silva"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "joao@teste.com"
 *               senha:
 *                 type: string
 *                 minLength: 6
 *                 example: "123456"
 *               tipo_usuario:
 *                 type: string
 *                 enum: [vendedor, administrador]
 *                 default: vendedor
 *                 example: "vendedor"
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso
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
 *                   example: "Cadastro realizado com sucesso"
 *                 userId:
 *                   type: string
 *                   example: "1"
 *       400:
 *         description: Dados inválidos ou email já cadastrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /api/auth/register - Cadastrar novo usuário
router.post('/register', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    const { nome, email, senha, tipo_usuario = 'vendedor' } = req.body

    // Validações básicas
    if (!nome || !email || !senha) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, email e senha são obrigatórios'
      })
    }

    // Validar email
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Email inválido'
      })
    }

    // Validar senha (mínimo 6 caracteres)
    if (senha.length < 6) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Senha deve ter pelo menos 6 caracteres'
      })
    }

    // Validar tipo de usuário
    if (!['vendedor', 'administrador'].includes(tipo_usuario)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Tipo de usuário deve ser "vendedor" ou "administrador"'
      })
    }

    // Verificar se email já existe
    const usuarioExistente = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    )

    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Email já cadastrado'
      })
    }

    // Criptografar senha
    const saltRounds = 10
    const senhaHash = await bcrypt.hash(senha, saltRounds)

    // Inserir usuário no banco
    const novoUsuario = await pool.query(`
      INSERT INTO usuarios (nome, email, senha_hash, tipo_usuario)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nome, email, tipo_usuario, criado_em
    `, [nome, email.toLowerCase(), senhaHash, tipo_usuario])

    const usuario = novoUsuario.rows[0]

    console.log(`[AUTH] Novo usuário cadastrado: ${usuario.nome} (${usuario.email})`)

    res.status(201).json({
      sucesso: true,
      mensagem: 'Cadastro realizado com sucesso',
      userId: usuario.id.toString()
    })
  } catch (error) {
    console.error('[AUTH] Erro no cadastro:', error)
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    })
  }
})

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login de usuário
 *     description: Autentica um usuário e retorna token JWT
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - senha
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "joao@teste.com"
 *               senha:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 usuario:
 *                   $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: Credenciais inválidas ou usuário desativado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Dados obrigatórios não informados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /api/auth/login - Login de usuário
router.post('/login', async (req, res) => {
  try {
    const pool = req.app.locals.pool
    const { email, senha } = req.body

    // Validações básicas
    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Email e senha são obrigatórios'
      })
    }

    // Buscar usuário no banco
    const resultado = await pool.query(`
      SELECT id, nome, email, senha_hash, tipo_usuario, ativo
      FROM usuarios
      WHERE email = $1
    `, [email.toLowerCase()])

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Credenciais inválidas'
      })
    }

    const usuario = resultado.rows[0]

    // Verificar se usuário está ativo
    if (!usuario.ativo) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuário desativado. Entre em contato com o administrador.'
      })
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash)

    if (!senhaValida) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Credenciais inválidas'
      })
    }

    // Atualizar último login
    await pool.query(
      'UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = $1',
      [usuario.id]
    )

    // Gerar token JWT
    const token = gerarToken(usuario)

    console.log(`[AUTH] Login realizado: ${usuario.nome} (${usuario.email})`)

    res.json({
      sucesso: true,
      token: token,
      usuario: {
        id: usuario.id.toString(),
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo_usuario
      }
    })
  } catch (error) {
    console.error('[AUTH] Erro no login:', error)
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    })
  }
})

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obter dados do usuário logado
 *     description: Retorna informações do usuário autenticado
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "1"
 *                     nome:
 *                       type: string
 *                       example: "João Silva"
 *                     email:
 *                       type: string
 *                       example: "joao@teste.com"
 *                     tipo:
 *                       type: string
 *                       example: "vendedor"
 *                     criado_em:
 *                       type: string
 *                       format: date-time
 *                     ultimo_login:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Token inválido ou não fornecido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /api/auth/me - Obter dados do usuário logado
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token de acesso requerido'
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const pool = req.app.locals.pool

    const resultado = await pool.query(`
      SELECT id, nome, email, tipo_usuario, ativo, criado_em, ultimo_login
      FROM usuarios
      WHERE id = $1 AND ativo = true
    `, [decoded.id])

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Usuário não encontrado'
      })
    }

    const usuario = resultado.rows[0]

    res.json({
      sucesso: true,
      usuario: {
        id: usuario.id.toString(),
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo_usuario,
        criado_em: usuario.criado_em,
        ultimo_login: usuario.ultimo_login
      }
    })
  } catch (error) {
    console.error('[AUTH] Erro ao obter dados do usuário:', error)
    res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido'
    })
  }
})

module.exports = router