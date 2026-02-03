const axios = require('axios');

const asaasApi = axios.create({
  baseURL: process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3',
  headers: {
    'access_token': process.env.ASAAS_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Listar clientes da API Asaas
async function listarClientesAsaas(params = {}) {
  try {
    const response = await asaasApi.get('/customers', { params });
    return response.data;
  } catch (error) {
    console.error('[ASAAS] Erro ao listar clientes:', error.response?.data || error.message);
    throw error;
  }
}

// Buscar cliente específico no Asaas
async function buscarClienteAsaas(asaasId) {
  try {
    const response = await asaasApi.get(`/customers/${asaasId}`);
    return response.data;
  } catch (error) {
    console.error(`[ASAAS] Erro ao buscar cliente ${asaasId}:`, error.response?.data || error.message);
    throw error;
  }
}

// Criar cliente no Asaas
async function criarClienteAsaas(dadosCliente) {
  try {
    const response = await asaasApi.post('/customers', dadosCliente);
    return response.data;
  } catch (error) {
    console.error('[ASAAS] Erro ao criar cliente:', error.response?.data || error.message);
    throw error;
  }
}

// Atualizar cliente no Asaas
async function atualizarClienteAsaas(asaasId, dadosCliente) {
  try {
    const response = await asaasApi.put(`/customers/${asaasId}`, dadosCliente);
    return response.data;
  } catch (error) {
    console.error(`[ASAAS] Erro ao atualizar cliente ${asaasId}:`, error.response?.data || error.message);
    throw error;
  }
}

// Deletar cliente no Asaas
async function deletarClienteAsaas(asaasId) {
  try {
    const response = await asaasApi.delete(`/customers/${asaasId}`);
    return response.data;
  } catch (error) {
    console.error(`[ASAAS] Erro ao deletar cliente ${asaasId}:`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  listarClientesAsaas,
  buscarClienteAsaas,
  criarClienteAsaas,
  atualizarClienteAsaas,
  deletarClienteAsaas
};
