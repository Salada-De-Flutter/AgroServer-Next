# 🧪 Teste - Cadastro de Cliente com Verificação

## ✅ Servidor Rodando
- URL: http://localhost:3000
- Swagger: http://localhost:3000/api-docs

---

## 🔑 1. Obter Token JWT

Primeiro, faça login para obter o token:

### PowerShell:
```powershell
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"seu@email.com","senha":"suasenha"}'
$token = $loginResponse.token
Write-Host "Token: $token"
```

### cURL:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","senha":"suasenha"}'
```

---

## 📝 2. Cadastrar Cliente

### PowerShell (Recomendado para Windows):
```powershell
# Defina seu token aqui
$token = "SEU_TOKEN_AQUI"

# Caminho da foto do documento (crie um arquivo de teste ou use uma imagem real)
$fotoPath = "C:\Users\Flutter\Desktop\documento_teste.jpg"

# Criar FormData
$formData = @{
    nome = "João Silva"
    documento = "12345678900"
    telefone = "11987654321"
    endereco = "Rua das Flores, 123, São Paulo - SP"
    verificado = "true"
    vendedorId = "1"
    vendedorNome = "Maria Santos"
    fotoDocumento = Get-Item -Path $fotoPath
}

# Fazer requisição
Invoke-RestMethod -Uri "http://localhost:3000/api/clientes" `
    -Method POST `
    -Headers @{Authorization="Bearer $token"} `
    -Form $formData
```

### cURL (Linux/Mac/Git Bash):
```bash
curl -X POST http://localhost:3000/api/clientes \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -F "nome=João Silva" \
  -F "documento=12345678900" \
  -F "telefone=11987654321" \
  -F "endereco=Rua das Flores, 123, São Paulo - SP" \
  -F "verificado=true" \
  -F "vendedorId=1" \
  -F "vendedorNome=Maria Santos" \
  -F "fotoDocumento=@/caminho/para/documento.jpg"
```

---

## 📋 3. Resposta Esperada (Sucesso)

```json
{
  "sucesso": true,
  "mensagem": "Cliente cadastrado com sucesso",
  "cliente": {
    "id": 1,
    "nome": "João Silva",
    "documento": "12345678900",
    "telefone": "11987654321",
    "endereco": "Rua das Flores, 123, São Paulo - SP",
    "verificado": true,
    "vendedorId": 1,
    "vendedorNome": "Maria Santos",
    "asaasCustomerId": "cus_000005432764",
    "fotoDocumentoUrl": "/uploads/documentos/12345678900_1738838400000.jpg",
    "criadoEm": "2026-02-06T12:00:00.000Z"
  }
}
```

---

## ❌ 4. Possíveis Erros

### Erro 400 - CPF Inválido
```json
{
  "sucesso": false,
  "mensagem": "CPF ou CNPJ inválido"
}
```

### Erro 400 - Sem Foto
```json
{
  "sucesso": false,
  "mensagem": "Foto do documento é obrigatória"
}
```

### Erro 400 - Não Verificado
```json
{
  "sucesso": false,
  "mensagem": "Cliente deve passar pela verificação antes do cadastro"
}
```

### Erro 409 - Cliente Já Existe
```json
{
  "sucesso": false,
  "mensagem": "Cliente com este documento já está cadastrado"
}
```

### Erro 400 - Falha no Asaas
```json
{
  "sucesso": false,
  "mensagem": "Erro ao cadastrar no Asaas: Cliente já existe"
}
```

---

## 🖼️ 5. Criar Imagem de Teste

### PowerShell (criar uma imagem simples):
```powershell
# Criar uma imagem de teste com 1x1 pixel
$bytes = [byte[]](0x42, 0x4D, 0x3A, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28, 0, 0, 0, 0x01, 0, 0, 0, 0x01, 0, 0, 0, 0x01, 0, 0x18, 0, 0, 0, 0, 0, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0)
[System.IO.File]::WriteAllBytes("C:\Users\Flutter\Desktop\documento_teste.jpg", $bytes)
Write-Host "Imagem de teste criada: C:\Users\Flutter\Desktop\documento_teste.jpg"
```

Ou use qualquer foto JPG/PNG que você tenha no computador.

---

## 🔍 6. Verificar Cliente Cadastrado

### PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/clientes" `
    -Method GET `
    -Headers @{Authorization="Bearer $token"}
```

### cURL:
```bash
curl -X GET http://localhost:3000/api/clientes \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

---

## 📊 7. Ver Logs no Servidor

Verifique o console onde o servidor está rodando. Você verá:

```
[CADASTRO-CLIENTE] Iniciando cadastro
[CADASTRO-CLIENTE] Validando dados...
[CADASTRO-CLIENTE] Dados validados
[CADASTRO-CLIENTE] Cadastrando no Asaas...
[CADASTRO-CLIENTE] Asaas ID: cus_000005432764
[CADASTRO-CLIENTE] Salvando no database...
[CADASTRO-CLIENTE] Upload de foto concluído
[CADASTRO-CLIENTE] ✅ Cadastro finalizado - ID: 1
```

---

## 🛠️ 8. Testar Validações

### CPF Inválido:
```powershell
# Trocar documento para "11111111111" (CPF inválido)
$formData.documento = "11111111111"
Invoke-RestMethod -Uri "http://localhost:3000/api/clientes" `
    -Method POST `
    -Headers @{Authorization="Bearer $token"} `
    -Form $formData
```

### Telefone Inválido:
```powershell
# Trocar telefone para "123" (telefone inválido)
$formData.telefone = "123"
Invoke-RestMethod -Uri "http://localhost:3000/api/clientes" `
    -Method POST `
    -Headers @{Authorization="Bearer $token"} `
    -Form $formData
```

---

## 📁 9. Verificar Upload

Após cadastro bem-sucedido, a foto estará em:
```
C:\Users\Flutter\Desktop\AgroServer-Next\uploads\documentos\12345678900_[timestamp].jpg
```

---

## 🎯 Checklist de Teste

- [ ] Login realizado e token obtido
- [ ] Cliente cadastrado com sucesso
- [ ] Cliente aparece no banco de dados
- [ ] Cliente aparece no Asaas
- [ ] Foto do documento foi salva em uploads/documentos
- [ ] Validação de CPF funciona (rejeita CPF inválido)
- [ ] Validação de telefone funciona
- [ ] Não permite cadastrar cliente duplicado (mesmo documento)
- [ ] Rollback funciona (se falhar no DB, remove do Asaas)

---

**Desenvolvido para:** AgroVendas App  
**Versão:** 1.0  
**Data:** Fevereiro/2026
