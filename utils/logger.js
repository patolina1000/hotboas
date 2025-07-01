function logEvento(msg, tipo = 'info') {
  const data = new Date().toLocaleString('pt-BR');
  const prefix = tipo === 'erro' ? '❌' : tipo === 'sucesso' ? '✅' : '🕓';
  console.log(`${prefix} [${data}] ${msg}`);
}

module.exports = { logEvento };