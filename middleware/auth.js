const jwt = require('jsonwebtoken')

// Middleware para verificar autenticação
const verificarToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token de acesso requerido'
    })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = decoded
    next()
  } catch (error) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido'
    })
  }
}

// Middleware para verificar se é administrador
const verificarAdmin = (req, res, next) => {
  if (req.usuario.tipo !== 'administrador') {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Acesso negado. Apenas administradores podem acessar este recurso.'
    })
  }
  next()
}

module.exports = {
  verificarToken,
  verificarAdmin
}