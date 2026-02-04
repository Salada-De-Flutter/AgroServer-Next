-- Tabela para armazenar usuários do sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  tipo_usuario VARCHAR(20) NOT NULL DEFAULT 'vendedor',
  ativo BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_login TIMESTAMP NULL,
  
  -- Constraints
  CONSTRAINT usuarios_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT usuarios_tipo_check CHECK (tipo_usuario IN ('vendedor', 'administrador'))
);

-- Índices para otimizar consultas
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_tipo ON usuarios(tipo_usuario);
CREATE INDEX idx_usuarios_ativo ON usuarios(ativo);

-- Trigger para atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION atualizar_timestamp_usuarios()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_usuarios
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_usuarios();

-- Comentários na tabela
COMMENT ON TABLE usuarios IS 'Armazena informações de usuários do sistema para autenticação';
COMMENT ON COLUMN usuarios.senha_hash IS 'Hash bcrypt da senha do usuário';
COMMENT ON COLUMN usuarios.tipo_usuario IS 'Tipo de usuário: vendedor ou administrador';
COMMENT ON COLUMN usuarios.ativo IS 'Indica se o usuário está ativo no sistema';

-- Criar usuário administrador padrão (senha: admin123)
-- Hash bcrypt para 'admin123': $2a$10$N9qo8uLOickgx2ZMRZoMye1J5zrUKo4YmYjnBOZnvPTnvXR3qTrN2
INSERT INTO usuarios (nome, email, senha_hash, tipo_usuario)
VALUES ('Administrador', 'admin@agroserver.com', '$2a$10$N9qo8uLOickgx2ZMRZoMye1J5zrUKo4YmYjnBOZnvPTnvXR3qTrN2', 'administrador')
ON CONFLICT (email) DO NOTHING;