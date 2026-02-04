-- Tabela para armazenar cobranças (payments) do Asaas
CREATE TABLE IF NOT EXISTS cobrancas (
  id SERIAL PRIMARY KEY,
  asaas_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Informações básicas
  valor DECIMAL(10, 2),
  valor_liquido DECIMAL(10, 2),
  valor_original DECIMAL(10, 2),
  valor_juros DECIMAL(10, 2),
  descricao TEXT,
  
  -- Forma de pagamento e status
  forma_pagamento VARCHAR(50), -- CREDIT_CARD, BOLETO, PIX, etc.
  status VARCHAR(50), -- PENDING, RECEIVED, CONFIRMED, OVERDUE, etc.
  
  -- Datas
  data_criacao_asaas DATE,
  data_vencimento DATE,
  data_vencimento_original DATE,
  data_pagamento DATE,
  data_pagamento_cliente DATE,
  data_credito DATE,
  data_credito_estimada DATE,
  
  -- Relacionamentos
  cliente_asaas_id VARCHAR(255), -- FK para clientes
  assinatura_id VARCHAR(255),
  parcelamento_id VARCHAR(255),
  numero_parcela INTEGER,
  checkout_session VARCHAR(255),
  payment_link VARCHAR(255),
  
  -- Informações de fatura
  url_fatura TEXT,
  numero_fatura VARCHAR(255),
  referencia_externa VARCHAR(255),
  
  -- Informações específicas de boleto
  nosso_numero VARCHAR(255),
  url_boleto TEXT,
  pode_pagar_apos_vencimento BOOLEAN DEFAULT TRUE,
  
  -- Informações de Pix
  pix_transacao_id VARCHAR(255),
  pix_qrcode_id VARCHAR(255),
  
  -- Informações do cartão de crédito (quando aplicável)
  cartao_ultimos_digitos VARCHAR(4),
  cartao_bandeira VARCHAR(50),
  cartao_token TEXT,
  
  -- URLs e comprovantes
  url_comprovante TEXT,
  
  -- Desconto
  desconto_valor DECIMAL(10, 2),
  desconto_dias_limite INTEGER,
  desconto_tipo VARCHAR(20), -- FIXED, PERCENTAGE
  
  -- Multa e juros
  multa_percentual DECIMAL(5, 2),
  juros_percentual DECIMAL(5, 2),
  
  -- Flags
  deletado BOOLEAN DEFAULT FALSE,
  antecipado BOOLEAN DEFAULT FALSE,
  antecipavel BOOLEAN DEFAULT FALSE,
  envio_correios BOOLEAN DEFAULT FALSE,
  
  -- Cancelamento de registro (boleto)
  dias_apos_vencimento_para_cancelamento INTEGER,
  
  -- Timestamps
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimizar consultas
CREATE INDEX idx_cobrancas_asaas_id ON cobrancas(asaas_id);
CREATE INDEX idx_cobrancas_cliente ON cobrancas(cliente_asaas_id);
CREATE INDEX idx_cobrancas_status ON cobrancas(status);
CREATE INDEX idx_cobrancas_forma_pagamento ON cobrancas(forma_pagamento);
CREATE INDEX idx_cobrancas_data_criacao ON cobrancas(data_criacao_asaas);
CREATE INDEX idx_cobrancas_data_vencimento ON cobrancas(data_vencimento);
CREATE INDEX idx_cobrancas_data_pagamento ON cobrancas(data_pagamento);
CREATE INDEX idx_cobrancas_parcelamento ON cobrancas(parcelamento_id);
CREATE INDEX idx_cobrancas_assinatura ON cobrancas(assinatura_id);
CREATE INDEX idx_cobrancas_deletado ON cobrancas(deletado);
CREATE INDEX idx_cobrancas_referencia_externa ON cobrancas(referencia_externa);

-- Trigger para atualizar o timestamp automaticamente
CREATE OR REPLACE FUNCTION atualizar_timestamp_cobrancas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_cobrancas
BEFORE UPDATE ON cobrancas
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_cobrancas();

-- Comentários na tabela
COMMENT ON TABLE cobrancas IS 'Armazena informações de cobranças (payments) sincronizadas do Asaas';
COMMENT ON COLUMN cobrancas.asaas_id IS 'Identificador único da cobrança no Asaas';
COMMENT ON COLUMN cobrancas.cliente_asaas_id IS 'Identificador do cliente no Asaas (referencia clientes.asaas_id)';
COMMENT ON COLUMN cobrancas.parcelamento_id IS 'Identificador do parcelamento no Asaas (quando cobrança parcelada)';
COMMENT ON COLUMN cobrancas.assinatura_id IS 'Identificador da assinatura no Asaas (quando cobrança recorrente)';
