-- Adicionar colunas para sistema de verificação de clientes
-- Data: 2026-02-06

-- Adicionar coluna de verificação
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT FALSE;

-- Adicionar ID do vendedor
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS vendedor_id INTEGER;

-- Adicionar nome do vendedor
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS vendedor_nome VARCHAR(255);

-- Adicionar URL da foto do documento
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS foto_documento_url TEXT;

-- Adicionar índice para vendedor
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_id ON clientes(vendedor_id);

-- Adicionar índice para clientes verificados
CREATE INDEX IF NOT EXISTS idx_clientes_verificado ON clientes(verificado) WHERE verificado = TRUE;

-- Comentários
COMMENT ON COLUMN clientes.verificado IS 'Indica se o cliente passou pelo processo de verificação';
COMMENT ON COLUMN clientes.vendedor_id IS 'ID do vendedor que cadastrou o cliente';
COMMENT ON COLUMN clientes.vendedor_nome IS 'Nome do vendedor que cadastrou o cliente';
COMMENT ON COLUMN clientes.foto_documento_url IS 'URL/caminho da foto do documento do cliente';

-- Tornar asaas_id nullable temporariamente (para clientes em processo de cadastro)
ALTER TABLE clientes 
ALTER COLUMN asaas_id DROP NOT NULL;

-- Adicionar constraint para garantir que clientes verificados têm asaas_id
ALTER TABLE clientes
DROP CONSTRAINT IF EXISTS chk_verificado_asaas;

ALTER TABLE clientes
ADD CONSTRAINT chk_verificado_asaas 
CHECK (verificado = FALSE OR asaas_id IS NOT NULL);

SELECT 'Migração concluída: Colunas de verificação adicionadas com sucesso!' as resultado;
