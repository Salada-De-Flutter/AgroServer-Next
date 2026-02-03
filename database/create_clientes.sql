-- Tabela de clientes integrada com API Asaas
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    asaas_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- Dados pessoais
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    telefone VARCHAR(20),
    celular VARCHAR(20),
    cpf_cnpj VARCHAR(18),
    tipo_pessoa VARCHAR(10) CHECK (tipo_pessoa IN ('FISICA', 'JURIDICA')),
    estrangeiro BOOLEAN DEFAULT FALSE,
    
    -- Endereço
    endereco VARCHAR(255),
    numero_endereco VARCHAR(20),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade_id INTEGER,
    cidade_nome VARCHAR(100),
    estado VARCHAR(2),
    pais VARCHAR(50) DEFAULT 'Brasil',
    cep VARCHAR(10),
    
    -- Informações adicionais
    emails_adicionais TEXT,
    referencia_externa VARCHAR(100),
    notificacoes_desabilitadas BOOLEAN DEFAULT FALSE,
    observacoes TEXT,
    deletado BOOLEAN DEFAULT FALSE,
    
    -- Auditoria
    data_criacao_asaas DATE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhorar performance
CREATE INDEX idx_clientes_asaas_id ON clientes(asaas_id);
CREATE INDEX idx_clientes_cpf_cnpj ON clientes(cpf_cnpj);
CREATE INDEX idx_clientes_email ON clientes(email);
CREATE INDEX idx_clientes_nome ON clientes(nome);
CREATE INDEX idx_clientes_referencia_externa ON clientes(referencia_externa);
CREATE INDEX idx_clientes_deletado ON clientes(deletado) WHERE deletado = FALSE;

-- Função para atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar timestamp
CREATE TRIGGER trigger_atualizar_timestamp_clientes
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_timestamp();

-- Comentários da tabela
COMMENT ON TABLE clientes IS 'Tabela de clientes sincronizada com API Asaas';
COMMENT ON COLUMN clientes.asaas_id IS 'Identificador único do cliente no Asaas';
COMMENT ON COLUMN clientes.tipo_pessoa IS 'Tipo de pessoa: FISICA ou JURIDICA';
COMMENT ON COLUMN clientes.referencia_externa IS 'Identificador do cliente no sistema externo';
