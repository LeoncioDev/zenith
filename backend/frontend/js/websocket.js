// @ts-nocheck
/**
 * websocket.js — Conexão WebSocket com o backend relay
 *
 * Gerencia a conexão entre o frontend e o servidor Node.js,
 * que por sua vez faz relay dos dados da Binance em tempo real.
 *
 * Funcionalidades:
 * - Conexão automática usando o protocolo correto (ws:// ou wss://)
 * - Reconexão automática após 3 segundos em caso de desconexão
 * - Sistema de eventos pub/sub para desacoplar os módulos
 * - Atualização visual do status de conexão na navbar
 *
 * Uso:
 *   WS.connect();           // inicia a conexão
 *   WS.on('ticker', fn);    // escuta eventos de ticker
 *   WS.on('snapshot', fn);  // escuta o snapshot inicial
 */

const WS = (() => {
  let socket        = null; // instância WebSocket atual
  let reconnectTimer = null; // timer de reconexão pendente
  const listeners   = {};   // { eventName: [fn1, fn2, ...] }

  /**
   * Registra um listener para um tipo de evento WebSocket.
   * Os eventos são definidos pelo campo `type` das mensagens JSON.
   *
   * @param {string}   event - Nome do evento ("ticker", "snapshot")
   * @param {Function} fn    - Função chamada com os dados do evento
   */
  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  /**
   * Dispara todos os listeners registrados para um evento.
   *
   * @param {string} event - Nome do evento
   * @param {any}    data  - Dados a passar para os listeners
   */
  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  }

  /**
   * Atualiza o indicador visual de status de conexão na navbar.
   * Mostra "Ao vivo" com ponto verde quando conectado,
   * ou "Reconectando..." com ponto vermelho quando desconectado.
   *
   * @param {boolean} connected - true = conectado, false = desconectado
   */
  function setStatus(connected) {
    const el    = document.getElementById('connectionStatus');
    const label = el?.querySelector('.connection-status__label');

    if (connected) {
      el?.classList.add('connection-status--connected');
      if (label) label.textContent = 'Ao vivo';
    } else {
      el?.classList.remove('connection-status--connected');
      if (label) label.textContent = 'Reconectando...';
    }
  }

  /**
   * Abre a conexão WebSocket com o backend.
   * Usa wss:// em HTTPS e ws:// em HTTP — importante para produção (Hostinger).
   * Em caso de desconexão, agenda reconexão automática após 3 segundos.
   */
  function connect() {
    // Detecta o protocolo correto baseado na URL atual
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url      = `${protocol}://${location.host}/ws/prices`;

    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('[WS] Conectado');
      setStatus(true);
      // Cancela qualquer timer de reconexão pendente
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    socket.onmessage = (event) => {
      try {
        // Todas as mensagens são JSON com { type, data }
        const msg = JSON.parse(event.data);
        emit(msg.type, msg.data); // dispara o listener correto
      } catch (e) {
        console.warn('[WS] Erro ao parsear mensagem:', e);
      }
    };

    socket.onclose = () => {
      console.warn('[WS] Conexão fechada. Reconectando em 3s...');
      setStatus(false);
      // Agenda reconexão — o backend pode ter reiniciado
      reconnectTimer = setTimeout(connect, 3000);
    };

    socket.onerror = (err) => {
      console.error('[WS] Erro:', err);
      socket.close(); // provoca o onclose que cuidará da reconexão
    };
  }

  // Expõe apenas connect e on — socket é privado ao módulo
  return { connect, on };
})();