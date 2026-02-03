# AgroServer-Next

API REST para sistema agrícola usando Node.js, Express e PostgreSQL.

## 📋 Pré-requisitos

- **Node.js** v18 ou superior ([Download](https://nodejs.org/))
- **PostgreSQL** v12 ou superior
- **npm** (instalado com Node.js)

## 🚀 Instalação

### 1. Instalar Node.js

Se ainda não tem Node.js instalado:
1. Acesse https://nodejs.org/
2. Baixe a versão **LTS** (recomendada)
3. Execute o instalador e siga o wizard
4. Após instalação, **feche e reabra o terminal**

Verifique a instalação:
```bash
node --version
npm --version
```

### 2. Instalar dependências do projeto

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto (copie do `.env.example`):

```bash
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_USER=dev
DB_PASSWORD=dev
DB_NAME=devdb
DB_PORT=5432
```

### 4. Configurar banco de dados PostgreSQL

Certifique-se de que o PostgreSQL está rodando e crie o banco de dados:

```sql
CREATE DATABASE devdb;
CREATE USER dev WITH PASSWORD 'dev';
GRANT ALL PRIVILEGES ON DATABASE devdb TO dev;
```

## 🏃 Executar o servidor

### Modo desenvolvimento (com auto-reload)
```bash
npm run dev
```

### Modo produção
```bash
npm start
```

O servidor estará disponível em: http://localhost:3000

## 📡 Endpoints disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Informações da API |
| GET | `/health` | Status do servidor e banco |
| GET | `/api/exemplo` | Endpoint de exemplo |

### Testar a API

```bash
# Health check
curl http://localhost:3000/health

# Rota principal
curl http://localhost:3000/

# Exemplo de API
curl http://localhost:3000/api/exemplo
```

## 🛠️ Stack

- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **PostgreSQL** - Banco de dados relacional
- **CORS** - Middleware para habilitar CORS
- **dotenv** - Gerenciamento de variáveis de ambiente
- **nodemon** - Auto-reload em desenvolvimento

## 📁 Estrutura do projeto

```
AgroServer-Next/
├── index.js           # Arquivo principal do servidor
├── package.json       # Dependências e scripts
├── .env.example       # Exemplo de configuração
├── .gitignore         # Arquivos ignorados no Git
├── Dockerfile         # Container Docker
└── README.md          # Documentação
```

## 🐛 Solução de problemas

### Erro: "Cannot find module 'express'"
Execute: `npm install`

### Erro de conexão com PostgreSQL
- Verifique se o PostgreSQL está rodando
- Confirme as credenciais no arquivo `.env`
- Teste a conexão: `psql -U dev -d devdb`

### Porta 3000 já em uso
Altere a variável `PORT` no arquivo `.env`

## 📝 Próximos passos

- [ ] Adicionar autenticação JWT
- [ ] Criar rotas CRUD para recursos
- [ ] Implementar validação de dados
- [ ] Adicionar testes automatizados
- [ ] Documentar API com Swagger

## 📄 Licença

ISC
