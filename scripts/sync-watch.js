#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');
const { listarClientesAsaas } = require('../services/asaas');

// Configuração do banco
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'flutter',
  password: process.env.DB_PASSWORD || '4002',
  database: process.env.DB_NAME || 'AgroServerDB',
  port: process.env.DB_PORT || 5432
});

let intervalo = 60000; // 1 minuto por padrão
let rodando = true;

// Converter dados do Asaas para formato do banco
function converterClienteAsaasParaDb(clienteAsaas) {
  return {
    asaas_id: clienteAsaas.id,
    nome: clienteAsaas.name,
    email: clienteAsaas.email,
    telefone: clienteAsaas.phone,
    celular: clienteAsaas.mobilePhone,
    cpf_cnpj: clienteAsaas.cpfCnpj,
    tipo_pessoa: clienteAsaas.personType,
    estrangeiro: clienteAsaas.foreignCustomer || false,
    endereco: clienteAsaas.address,
    numero_endereco: clienteAsaas.addressNumber,
    complemento: clienteAsaas.complement,
    bairro: clienteAsaas.province,
    cidade_id: clienteAsaas.city,
    cidade_nome: clienteAsaas.cityName,
    estado: clienteAsaas.state,
    pais: clienteAsaas.country || 'Brasil',
    cep: clienteAsaas.postalCode,
    emails_adicionais: clienteAsaas.additionalEmails,
    referencia_externa: clienteAsaas.externalReference,
    notificacoes_desabilitadas: clienteAsaas.notificationDisabled || false,
    observacoes: clienteAsaas.observations,
    deletado: clienteAsaas.deleted || false,
    data_criacao_asaas: clienteAsaas.dateCreated
  };
}

async function sincronizarClientes() {
  let offset = 0;
  const limit = 100;
  let totalSincronizados = 0;
  let totalNovos = 0;
  let totalAtualizados = 0;
  let hasMore = true;

  console.log(`\n[${new Date().toLocaleTimeString()}] Iniciando sincronizacao...`);

  try {
    while (hasMore) {
      const dadosAsaas = await listarClientesAsaas({ offset, limit });

      for (const clienteAsaas of dadosAsaas.data) {
        const clienteDb = converterClienteAsaasParaDb(clienteAsaas);

        const existente = await pool.query(
          'SELECT id FROM clientes WHERE asaas_id = $1',
          [clienteDb.asaas_id]
        );

        if (existente.rows.length > 0) {
          await pool.query(`
            UPDATE clientes SET
              nome = $1, email = $2, telefone = $3, celular = $4,
              cpf_cnpj = $5, tipo_pessoa = $6, estrangeiro = $7,
              endereco = $8, numero_endereco = $9, complemento = $10,
              bairro = $11, cidade_id = $12, cidade_nome = $13,
              estado = $14, pais = $15, cep = $16,
              emails_adicionais = $17, referencia_externa = $18,
              notificacoes_desabilitadas = $19, observacoes = $20,
              deletado = $21, data_criacao_asaas = $22
            WHERE asaas_id = $23
          `, [
            clienteDb.nome, clienteDb.email, clienteDb.telefone, clienteDb.celular,
            clienteDb.cpf_cnpj, clienteDb.tipo_pessoa, clienteDb.estrangeiro,
            clienteDb.endereco, clienteDb.numero_endereco, clienteDb.complemento,
            clienteDb.bairro, clienteDb.cidade_id, clienteDb.cidade_nome,
            clienteDb.estado, clienteDb.pais, clienteDb.cep,
            clienteDb.emails_adicionais, clienteDb.referencia_externa,
            clienteDb.notificacoes_desabilitadas, clienteDb.observacoes,
            clienteDb.deletado, clienteDb.data_criacao_asaas,
            clienteDb.asaas_id
          ]);
          totalAtualizados++;
        } else {
          await pool.query(`
            INSERT INTO clientes (
              asaas_id, nome, email, telefone, celular, cpf_cnpj,
              tipo_pessoa, estrangeiro, endereco, numero_endereco,
              complemento, bairro, cidade_id, cidade_nome, estado,
              pais, cep, emails_adicionais, referencia_externa,
              notificacoes_desabilitadas, observacoes, deletado,
              data_criacao_asaas
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
            )
          `, [
            clienteDb.asaas_id, clienteDb.nome, clienteDb.email,
            clienteDb.telefone, clienteDb.celular, clienteDb.cpf_cnpj,
            clienteDb.tipo_pessoa, clienteDb.estrangeiro, clienteDb.endereco,
            clienteDb.numero_endereco, clienteDb.complemento, clienteDb.bairro,
            clienteDb.cidade_id, clienteDb.cidade_nome, clienteDb.estado,
            clienteDb.pais, clienteDb.cep, clienteDb.emails_adicionais,
            clienteDb.referencia_externa, clienteDb.notificacoes_desabilitadas,
            clienteDb.observacoes, clienteDb.deletado, clienteDb.data_criacao_asaas
          ]);
          totalNovos++;
        }
        totalSincronizados++;
      }

      hasMore = dadosAsaas.hasMore;
      offset += limit;
    }

    console.log(`[${new Date().toLocaleTimeString()}] Concluido: ${totalSincronizados} total | ${totalNovos} novos | ${totalAtualizados} atualizados`);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Erro:`, error.message);
  }
}

async function iniciar() {
  console.log('========================================');
  console.log('SINCRONIZACAO AUTOMATICA - ASAAS');
  console.log('========================================');
  console.log(`Intervalo: ${intervalo / 1000}s`);
  console.log('Pressione Ctrl+C para parar\n');

  try {
    await pool.query('SELECT 1');
    console.log('[OK] Conectado ao banco PostgreSQL\n');
  } catch (error) {
    console.error('[ERRO] Falha ao conectar ao banco:', error.message);
    process.exit(1);
  }

  // Sincronizar imediatamente
  await sincronizarClientes();

  // Continuar sincronizando em intervalo
  const timer = setInterval(async () => {
    if (rodando) {
      await sincronizarClientes();
    }
  }, intervalo);

  // Tratar Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n\n[INFO] Encerrando sincronizacao...');
    rodando = false;
    clearInterval(timer);
    await pool.end();
    console.log('[OK] Encerrado\n');
    process.exit(0);
  });
}

// Executar
iniciar();
