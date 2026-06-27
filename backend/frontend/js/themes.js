// @ts-nocheck
/**
 * themes.js — Gerenciamento de temas visuais + título dinâmico
 *
 * Controla os 4 temas do Zenith (Dark, Light, Hacker, Blood) e
 * persiste a preferência do usuário no localStorage.
 *
 * Como os temas funcionam:
 * - Cada tema é um arquivo CSS em /css/themes/ com variáveis CSS próprias
 * - O atributo data-theme no <html> determina qual tema está ativo
 * - Os gráficos lêem as variáveis CSS via getComputedStyle para atualizar suas cores
 * - O MutationObserver em charts.js detecta a mudança e atualiza os gráficos
 */

const THEME_KEY     = 'zenith_theme'; // chave de persistência no localStorage
const DEFAULT_THEME = 'dark';              // tema padrão se não houver preferência salva

// Configuração visual de cada tema para o dropdown
const THEME_CONFIG = {
  dark:   { label: 'Dark',   dot: '#4493f8' }, // azul
  light:  { label: 'Light',  dot: '#1B3A6B' }, // azul escuro
  hacker: { label: 'Hacker', dot: '#00ff41' }, // verde terminal
  blood:  { label: 'Blood',  dot: '#ff0033' }, // vermelho
};

const ThemeManager = (() => {

  /**
   * Aplica um tema ao documento.
   * - Define o atributo data-theme no <html> (os CSS de tema usam este seletor)
   * - Salva a preferência no localStorage
   * - Atualiza o botão do dropdown com a cor e label do tema
   * - Fecha o dropdown
   *
   * @param {string} theme - Nome do tema ("dark", "light", "hacker", "blood")
   */
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    // Atualiza o indicador visual do botão principal do dropdown
    const config = THEME_CONFIG[theme] || THEME_CONFIG.dark;
    const dot    = document.getElementById('themeDropdownDot');
    const label  = document.getElementById('themeDropdownLabel');
    if (dot)   dot.style.background = config.dot;
    if (label) label.textContent    = config.label;

    // Marca a opção ativa no menu
    document.querySelectorAll('.theme-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.theme === theme);
    });

    // Fecha o dropdown após selecionar
    const dropdown = document.getElementById('themeDropdown');
    if (dropdown) dropdown.classList.remove('open');

    // Atualiza o atributo data-text para o efeito glitch do tema Hacker
    // O CSS usa ::before e ::after com este atributo para criar o efeito
    const brandName = document.querySelector('.navbar__name');
    if (brandName) brandName.setAttribute('data-text', brandName.textContent);
  }

  /**
   * Inicializa o dropdown de seleção de temas.
   * - Abre/fecha ao clicar no botão
   * - Fecha ao clicar fora
   * - Aplica o tema ao clicar numa opção
   */
  function initDropdown() {
    const btn      = document.getElementById('themeDropdownBtn');
    const dropdown = document.getElementById('themeDropdown');

    if (!btn || !dropdown) return;

    // Abre ou fecha o dropdown ao clicar no botão
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // evita que o click propague e feche imediatamente
      dropdown.classList.toggle('open');
    });

    // Fecha o dropdown ao clicar em qualquer lugar fora dele
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    // Aplica o tema ao clicar numa opção do menu
    document.querySelectorAll('.theme-option').forEach(opt => {
      opt.addEventListener('click', () => apply(opt.dataset.theme));
    });
  }

  /**
   * Inicializa o ThemeManager.
   * Restaura o tema salvo (ou aplica o padrão) e configura o dropdown.
   */
  function init() {
    const saved = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    apply(saved);
    initDropdown();
  }

  return { init, apply };
})();

// ── Título dinâmico na aba do navegador ──────────────────────────────────────

/**
 * DynamicTitle
 * Atualiza o título da aba do navegador com o preço atual do BTC.
 * Adiciona emoji 🟢 ou 🔴 baseado na direção do preço.
 *
 * Exemplo: "🟢 $64,179.30 | Zenith"
 */
const DynamicTitle = (() => {
  let lastPrice = null; // evita atualização desnecessária se o preço não mudou

  /**
   * Atualiza o título com o preço do BTC.
   * Não faz nada se o preço não mudou desde a última atualização.
   *
   * @param {number} price - Preço atual do BTC em USD
   */
  function update(price) {
    if (price === lastPrice) return;
    lastPrice = price;

    const formatted = price >= 1000
      ? '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$' + price.toFixed(2);

    // Extrai o preço anterior do título atual para determinar a direção
    const prev  = parseFloat(document.title.replace(/[^0-9.]/g, '') || '0');
    const emoji = price >= prev ? '🟢' : '🔴';

    document.title = `${emoji} ${formatted} | Zenith`;
  }

  return { update };
})();