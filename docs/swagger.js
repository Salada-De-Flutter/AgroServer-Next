const swaggerJSDoc = require('swagger-jsdoc')

module.exports = (ambiente = 'dev', baseUrl = 'http://localhost:3000') => {
  const servers = ambiente === 'prod' 
    ? [
        {
          url: baseUrl,
          description: 'Servidor de produção'
        },
        {
          url: 'http://localhost:3000',
          description: 'Servidor de desenvolvimento'
        }
      ]
    : [
        {
          url: baseUrl,
          description: 'Servidor de desenvolvimento'
        },
        {
          url: baseUrl.replace('http://localhost:3000', 'https://api.agrosystemapp.com'),
          description: 'Servidor de produção'
        }
      ]

  const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgroServer API',
      version: '1.0.0',
      description: 'API para sistema de gerenciamento agrícola integrado com Asaas',
      contact: {
        name: 'AgroServer Support',
        email: 'support@agrosystemapp.com'
      }
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Usuario: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '1' },
            nome: { type: 'string', example: 'João Silva' },
            email: { type: 'string', format: 'email', example: 'joao@teste.com' },
            tipo: { type: 'string', enum: ['vendedor', 'administrador'], example: 'vendedor' }
          }
        },
        Cliente: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            asaas_id: { type: 'string', example: 'cus_G7Dvo4iphUNk' },
            nome: { type: 'string', example: 'João Silva' },
            email: { type: 'string', format: 'email', example: 'joao@cliente.com' },
            telefone: { type: 'string', example: '(11) 99999-9999' },
            cpf_cnpj: { type: 'string', example: '123.456.789-00' },
            tipo_pessoa: { type: 'string', enum: ['FISICA', 'JURIDICA'], example: 'FISICA' },
            deletado: { type: 'boolean', example: false },
            criado_em: { type: 'string', format: 'date-time' }
          }
        },
        Parcelamento: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            asaas_id: { type: 'string', example: '2765d086-c7c5-5cca-898a-4262d212587c' },
            valor: { type: 'number', format: 'decimal', example: 360.00 },
            valor_liquido: { type: 'number', format: 'decimal', example: 312.12 },
            numero_parcelas: { type: 'integer', example: 12 },
            forma_pagamento: { type: 'string', enum: ['CREDIT_CARD', 'BOLETO', 'PIX'], example: 'CREDIT_CARD' },
            cliente_asaas_id: { type: 'string', example: 'cus_G7Dvo4iphUNk' },
            deletado: { type: 'boolean', example: false }
          }
        },
        Cobranca: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            asaas_id: { type: 'string', example: 'pay_080225913252' },
            valor: { type: 'number', format: 'decimal', example: 129.90 },
            valor_liquido: { type: 'number', format: 'decimal', example: 124.90 },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'RECEIVED', 'CONFIRMED', 'OVERDUE', 'REFUNDED'], 
              example: 'PENDING' 
            },
            forma_pagamento: { type: 'string', enum: ['BOLETO', 'CREDIT_CARD', 'PIX'], example: 'BOLETO' },
            data_vencimento: { type: 'string', format: 'date', example: '2026-03-01' },
            cliente_asaas_id: { type: 'string', example: 'cus_G7Dvo4iphUNk' },
            parcelamento_id: { type: 'string', example: '2765d086-c7c5-5cca-898a-4262d212587c' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            sucesso: { type: 'boolean', example: false },
            mensagem: { type: 'string', example: 'Mensagem de erro' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            sucesso: { type: 'boolean', example: true },
            mensagem: { type: 'string', example: 'Operação realizada com sucesso' }
          }
        }
      }
    },
    security: []
  },
  apis: ['./routes/*.js', './index.js']
}

return swaggerJSDoc(options)
}