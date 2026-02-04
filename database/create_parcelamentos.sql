-- Tabela para armazenar parcelamentos do Asaas
CREATE TABLE IF NOT EXISTS parcelamentos (
  id SERIAL PRIMARY KEY,
  asaas_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Informações básicas
  valor DECIMAL(10, 2),
  valor_liquido DECIMAL(10, 2),
  valor_parcela DECIMAL(10, 2),
  numero_parcelas INTEGER,
  
  -- Forma de pagamento e status
  forma_pagamento VARCHAR(50), -- CREDIT_CARD, BOLETO, PIX, etc.
  data_pagamento DATE,
  descricao TEXT,
  
  -- Datas
  dia_vencimento INTEGER,
  data_criacao_asaas DATE,
  
  -- Relacionamentos
  cliente_asaas_id VARCHAR(255), -- FK para clientes
  payment_link VARCHAR(255),
  checkout_session VARCHAR(255),
  
  -- URLs e comprovantes
  url_comprovante TEXT,
  
  -- Informações do cartão de crédito (quando aplicável)
  cartao_ultimos_digitos VARCHAR(4),
  cartao_bandeira VARCHAR(50),
  cartao_token TEXT,
  
  -- Flags
  deletado BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimizar consultas
CREATE INDEX idx_parcelamentos_asaas_id ON parcelamentos(asaas_id);
CREATE INDEX idx_parcelamentos_cliente ON parcelamentos(cliente_asaas_id);
CREATE INDEX idx_parcelamentos_data_criacao ON parcelamentos(data_criacao_asaas);
CREATE INDEX idx_parcelamentos_forma_pagamento ON parcelamentos(forma_pagamento);
CREATE INDEX idx_parcelamentos_deletado ON parcelamentos(deletado);

-- Trigger para atualizar o timestamp automaticamente
CREATE OR REPLACE FUNCTION atualizar_timestamp_parcelamentos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_parcelamentos
BEFORE UPDATE ON parcelamentos
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_parcelamentos();

-- Comentários na tabela
COMMENT ON TABLE parcelamentos IS 'Armazena informações de parcelamentos sincronizados do Asaas';
COMMENT ON COLUMN parcelamentos.asaas_id IS 'Identificador único do parcelamento no Asaas';
COMMENT ON COLUMN parcelamentos.cliente_asaas_id IS 'Identificador do cliente no Asaas (referencia clientes.asaas_id)';
