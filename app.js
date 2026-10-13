const ACCOUNTS_KEY = 'ciclosangue-demo-accounts-v1';
const SESSION_KEY = 'ciclosangue-demo-session-v1';

const locations = [
  { id: 'cuiaba', name: 'Hemocentro Regional de Cuiabá', address: 'Av. Getúlio Vargas, 2.650 · Centro', city: 'Cuiabá', distance: '2,3 km' },
  { id: 'rondonopolis', name: 'Hemocentro de Rondonópolis', address: 'Av. Amazonas, 1.235 · Vila Aurora', city: 'Rondonópolis', distance: '5,8 km' },
  { id: 'caceres', name: 'Hemocentro de Cáceres', address: 'Rua Padre Casemiro, 456 · Centro', city: 'Cáceres', distance: '12,4 km' },
  { id: 'sinop', name: 'Unidade de Coleta de Sinop', address: 'Endereço e funcionamento a confirmar', city: 'Sinop', distance: '—' }
];
const exampleTimes = ['08:00', '08:40', '09:20', '10:00', '10:40', '11:20', '13:00', '13:40', '14:20'];
const defaultState = {
  profile: { name: 'Letícia Bassan Teodoro', email: 'l.bassan@email.com', blood: '' },
  appointments: [],
  notifications: [
    { icon: '♧', tone: 'pink', title: 'Um lembrete para você', message: 'A aptidão para doar é avaliada pela equipe do hemocentro em cada atendimento. Consulte as orientações oficiais antes de ir.', when: 'Informação importante' },
    { icon: '✦', tone: 'orange', title: 'Doe sangue, compartilhe esperança', message: 'Convide pessoas próximas a conhecer os canais oficiais de doação e a importância de doar.', when: 'Campanha' }
  ]
};
let state = structuredClone(defaultState);
let activeAccount = null;
let booking = { locationId: '', date: '', time: '' };
let pendingBookingLocation = '';
let pendingAuthView = '';
let toastTimer;

function accountDataKey(email) {
  return `ciclosangue-demo-data:${encodeURIComponent(email)}`;
}
function readAccounts() {
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [];
  const accounts = JSON.parse(raw);
  if (!Array.isArray(accounts)) throw new Error('O cadastro local está em um formato inválido.');
  return accounts;
}
function loadState(email, account) {
  const saved = localStorage.getItem(accountDataKey(email));
  if (!saved) return {
    ...structuredClone(defaultState),
    profile: { name: account.name, email: account.email, blood: account.blood || '' }
  };
  const parsed = JSON.parse(saved);
  return {
    ...structuredClone(defaultState),
    ...parsed,
    profile: { ...defaultState.profile, ...parsed.profile, email: account.email },
    appointments: Array.isArray(parsed.appointments) ? parsed.appointments : []
  };
}
function saveState() {
  try {
    if (!activeAccount) return;
    localStorage.setItem(accountDataKey(activeAccount.email), JSON.stringify(state));
  } catch (error) {
    console.error('Não foi possível salvar os dados locais do protótipo.', error);
    showToast('Não foi possível salvar. Verifique as permissões do navegador.');
  }
}
function setAuthMode(mode) {
  const loginActive = mode === 'login';
  document.querySelector('#login-tab').classList.toggle('active', loginActive);
  document.querySelector('#register-tab').classList.toggle('active', !loginActive);
  document.querySelector('#login-tab').setAttribute('aria-selected', String(loginActive));
  document.querySelector('#register-tab').setAttribute('aria-selected', String(!loginActive));
  document.querySelector('#login-form').classList.toggle('active', loginActive);
  document.querySelector('#register-form').classList.toggle('active', !loginActive);
  document.querySelector('#login-error').textContent = '';
  document.querySelector('#register-error').textContent = '';
}
function showAuth(mode = 'login', prompt = '') {
  document.querySelector('#auth-prompt').textContent = prompt;
  document.querySelector('#auth-screen').classList.remove('hidden');
  setAuthMode(mode);
}
function enterApp(account) {
  activeAccount = account;
  state = loadState(account.email, account);
  syncProfile();
  renderHistory();
  renderNotifications();
  document.querySelector('#auth-screen').classList.add('hidden');
  document.querySelector('.app-shell').classList.add('signed-in');
  if (pendingBookingLocation) {
    booking.locationId = pendingBookingLocation;
    pendingBookingLocation = '';
    renderLocations(document.querySelector('#booking-location-list'), '', true);
    document.querySelector('#to-step-2').disabled = false;
    goTo('agendar');
    setBookingStep(2);
  } else if (pendingAuthView) {
    const view = pendingAuthView;
    pendingAuthView = '';
    goTo(view);
  } else {
    goTo('inicio');
  }
}
async function passwordVerifier(password, salt) {
  if (!crypto.subtle) throw new Error('Este navegador não oferece criptografia local. Abra o protótipo em um navegador atualizado.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: Uint8Array.from(atob(salt), char => char.charCodeAt(0)),
    iterations: 120000,
    hash: 'SHA-256'
  }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}
function createSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function shortName(name) { return (name || 'Doador(a)').trim().split(/\s+/)[0]; }
function syncProfile() {
  const name = state.profile.name || 'Doador(a)';
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date()).toLocaleUpperCase('pt-BR');
  document.querySelector('#welcome-name').textContent = shortName(name);
  document.querySelector('#welcome-subtitle').textContent = 'Sua doação pode fazer a diferença na vida de alguém.';
  document.querySelector('#top-profile-name').textContent = shortName(name);
  document.querySelector('#profile-display-name').textContent = name;
  document.querySelector('#profile-initial').textContent = shortName(name).charAt(0).toUpperCase();
  document.querySelector('#home-blood-type').textContent = state.profile.blood || 'Não informado';
  document.querySelector('#profile-name').value = state.profile.name;
  document.querySelector('#profile-email').value = state.profile.email;
  document.querySelector('#profile-blood').value = state.profile.blood;
}
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}
function goTo(view) {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `view-${view}`));
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const labels = { inicio: 'Início', agendar: 'Agendar doação', locais: 'Onde doar', historico: 'Meu histórico', informacoes: 'Informações', notificacoes: 'Notificações', perfil: 'Meu perfil' };
  document.querySelector('#page-name').textContent = labels[view] || 'Início';
  if (view === 'historico') renderHistory();
  if (view === 'notificacoes') renderNotifications();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function navigateTo(view) {
  if (!activeAccount && ['agendar', 'historico', 'perfil', 'notificacoes'].includes(view)) {
    pendingAuthView = view;
    showAuth('login', 'Entre ou crie um cadastro para continuar com esta simulação.');
    return;
  }
  goTo(view);
}
function showPublicHome() {
  activeAccount = null;
  document.querySelector('.app-shell').classList.remove('signed-in');
  document.querySelector('.auth-screen').classList.add('hidden');
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date()).toLocaleUpperCase('pt-BR');
  document.querySelector('#welcome-name').textContent = 'bem-vindo(a) ao CicloSangue';
  document.querySelector('#welcome-subtitle').textContent = 'Conheça a plataforma. Entre ou cadastre-se quando quiser simular um agendamento.';
  document.querySelector('#home-blood-type').textContent = 'Faça login para ver seu perfil';
  goTo('inicio');
}
function closeAuth() {
  pendingBookingLocation = '';
  pendingAuthView = '';
  showPublicHome();
}
function renderLocations(target, filter = '', bookingList = false) {
  const query = filter.trim().toLocaleLowerCase('pt-BR');
  const items = locations.filter(place => `${place.name} ${place.address} ${place.city}`.toLocaleLowerCase('pt-BR').includes(query));
  target.innerHTML = items.length ? items.map(place => bookingList
    ? `<button class="location-option ${booking.locationId === place.id ? 'selected' : ''}" data-location-id="${place.id}"><span class="location-pin">◎</span><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.address)} · ${escapeHtml(place.distance)}</small></span><span>›</span></button>`
    : `<article class="place-card"><span class="location-pin">◎</span><div><strong>${escapeHtml(place.name)}</strong><p>${escapeHtml(place.address)} · ${escapeHtml(place.distance)}<br>Horários e endereço: confirme com a unidade.</p></div><button class="button button-primary" data-book-location="${place.id}">Agendar</button></article>`
  ).join('') : '<p class="history-empty">Nenhuma unidade encontrada. Tente outro nome ou cidade.</p>';
}
function getExampleDates() {
  const dates = [];
  for (let i = 2; i < 8; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  return dates;
}
function renderDates() {
  const weekdays = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
  document.querySelector('#date-picker').innerHTML = getExampleDates().map(date => {
    const value = date.toISOString().slice(0, 10);
    return `<button class="date-option ${booking.date === value ? 'selected' : ''}" data-date="${value}"><small>${weekdays[date.getDay()]}</small><strong>${date.getDate()} ${date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</strong></button>`;
  }).join('');
  document.querySelector('#time-grid').innerHTML = exampleTimes.map(time => `<button class="time-option ${booking.time === time ? 'selected' : ''}" data-time="${time}">${time}</button>`).join('');
}
function setBookingStep(step) {
  document.querySelectorAll('.booking-step').forEach(el => el.classList.toggle('active', el.id === `booking-step-${step}`));
  document.querySelectorAll('.step').forEach(el => {
    const current = Number(el.dataset.stepIndicator);
    el.classList.toggle('active', current === step);
    el.classList.toggle('complete', current < step);
  });
  if (step === 2) renderDates();
  if (step === 3) renderReview();
}
function renderReview() {
  const place = locations.find(item => item.id === booking.locationId);
  const date = new Date(`${booking.date}T12:00:00`);
  const prettyDate = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.querySelector('#booking-review').innerHTML = [
    ['Unidade', place ? place.name : '—'],
    ['Endereço', place ? place.address : '—'],
    ['Data', prettyDate],
    ['Horário de exemplo', booking.time]
  ].map(([label, value]) => `<div class="review-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  document.querySelector('#confirm-consent').checked = false;
  document.querySelector('#confirm-booking').disabled = true;
}
function renderHistory() {
  const history = state.appointments;
  document.querySelector('#appointment-count').textContent = history.length;
  document.querySelector('#donation-count').textContent = '0';
  document.querySelector('#history-list').innerHTML = history.length ? [...history].reverse().map(item => {
    const place = locations.find(location => location.id === item.locationId);
    const date = new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    return `<div class="history-item"><span class="history-symbol">▣</span><div><strong>Agendamento demonstrativo · ${escapeHtml(item.time)}</strong><p>${escapeHtml(place ? place.name : 'Unidade')} · ${date}</p></div><time>Não confirmado</time></div>`;
  }).join('') : '<div class="history-empty">Nenhum agendamento demonstrativo por enquanto. Quando você fizer um, ele aparecerá aqui.</div>';
}
function renderNotifications() {
  document.querySelector('#notifications-list').innerHTML = state.notifications.map(item => `<article class="notification-item"><span class="notice-icon ${item.tone}">${item.icon}</span><div><time>${escapeHtml(item.when)}</time><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></div></article>`).join('');
}
function resetBooking() {
  booking = { locationId: '', date: '', time: '' };
  document.querySelector('#to-step-2').disabled = true;
  document.querySelector('#confirm-consent').checked = false;
  document.querySelector('#confirm-booking').disabled = true;
  renderLocations(document.querySelector('#booking-location-list'), document.querySelector('#location-search').value, true);
  setBookingStep(1);
}

document.querySelectorAll('.auth-tab, [data-auth-mode]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.authMode || (button.id === 'register-tab' ? 'register' : 'login');
  setAuthMode(mode);
}));
document.querySelectorAll('[data-open-auth]').forEach(button => button.addEventListener('click', () => {
  showAuth(button.dataset.openAuth);
}));
document.querySelectorAll('[data-auth-close]').forEach(button => button.addEventListener('click', closeAuth));
document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorMessage = document.querySelector('#login-error');
  const submit = form.querySelector('[type="submit"]');
  const email = document.querySelector('#login-email').value.trim().toLocaleLowerCase('en-US');
  const password = document.querySelector('#login-password').value;
  errorMessage.textContent = '';
  submit.disabled = true;
  try {
    const account = readAccounts().find(item => item.email === email);
    if (!account || await passwordVerifier(password, account.salt) !== account.verifier) {
      errorMessage.textContent = 'E-mail ou senha incorretos. Confira os dados ou crie um cadastro.';
      return;
    }
    localStorage.setItem(SESSION_KEY, account.email);
    enterApp(account);
    form.reset();
  } catch (error) {
    console.error('Não foi possível entrar na conta demonstrativa.', error);
    errorMessage.textContent = 'Não foi possível entrar. Verifique o armazenamento local deste navegador e tente novamente.';
  } finally {
    submit.disabled = false;
  }
});
document.querySelector('#register-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorMessage = document.querySelector('#register-error');
  const submit = form.querySelector('[type="submit"]');
  const name = document.querySelector('#register-name').value.trim();
  const email = document.querySelector('#register-email').value.trim().toLocaleLowerCase('en-US');
  const password = document.querySelector('#register-password').value;
  const blood = document.querySelector('#register-blood').value;
  errorMessage.textContent = '';
  if (!name) {
    errorMessage.textContent = 'Informe seu nome para criar o cadastro.';
    return;
  }
  submit.disabled = true;
  try {
    const accounts = readAccounts();
    if (accounts.some(account => account.email === email)) {
      errorMessage.textContent = 'Já existe um cadastro demonstrativo com este e-mail. Entre ou use outro e-mail.';
      return;
    }
    const salt = createSalt();
    const account = { email, name, blood, salt, verifier: await passwordVerifier(password, salt) };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
    localStorage.setItem(accountDataKey(email), JSON.stringify({
      ...structuredClone(defaultState),
      profile: { name, email, blood }
    }));
    localStorage.setItem(SESSION_KEY, email);
    enterApp(account);
    form.reset();
  } catch (error) {
    console.error('Não foi possível criar o cadastro demonstrativo.', error);
    errorMessage.textContent = 'Não foi possível criar o cadastro. Verifique o armazenamento local deste navegador e tente novamente.';
  } finally {
    submit.disabled = false;
  }
});
document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Não foi possível encerrar a sessão demonstrativa.', error);
    showToast('Não foi possível encerrar a sessão neste navegador.');
  }
  activeAccount = null;
  pendingBookingLocation = '';
  pendingAuthView = '';
  resetBooking();
  showPublicHome();
}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigateTo(button.dataset.view)));
document.querySelector('#location-search').addEventListener('input', event => renderLocations(document.querySelector('#booking-location-list'), event.target.value, true));
document.querySelector('#places-search').addEventListener('input', event => renderLocations(document.querySelector('#places-list'), event.target.value));
document.querySelector('#booking-location-list').addEventListener('click', event => {
  const option = event.target.closest('[data-location-id]');
  if (!option) return;
  booking.locationId = option.dataset.locationId;
  document.querySelector('#to-step-2').disabled = false;
  renderLocations(document.querySelector('#booking-location-list'), document.querySelector('#location-search').value, true);
});
document.querySelector('#to-step-2').addEventListener('click', () => setBookingStep(2));
document.querySelector('#date-picker').addEventListener('click', event => {
  const option = event.target.closest('[data-date]');
  if (!option) return;
  booking.date = option.dataset.date;
  renderDates();
  document.querySelector('#to-step-3').disabled = !(booking.date && booking.time);
});
document.querySelector('#time-grid').addEventListener('click', event => {
  const option = event.target.closest('[data-time]');
  if (!option) return;
  booking.time = option.dataset.time;
  renderDates();
  document.querySelector('#to-step-3').disabled = !(booking.date && booking.time);
});
document.querySelectorAll('[data-booking-back]').forEach(button => button.addEventListener('click', () => setBookingStep(Number(button.dataset.bookingBack))));
document.querySelector('#to-step-3').addEventListener('click', () => setBookingStep(3));
document.querySelector('#confirm-consent').addEventListener('change', event => { document.querySelector('#confirm-booking').disabled = !event.target.checked; });
document.querySelector('#confirm-booking').addEventListener('click', () => {
  const entry = { ...booking, createdAt: new Date().toISOString() };
  state.appointments.push(entry);
  saveState();
  const details = document.querySelector('#booking-review').cloneNode(true);
  document.querySelector('#success-details').replaceChildren(details);
  document.querySelector('#appointment-dialog').showModal();
});
document.querySelector('#success-done').addEventListener('click', () => {
  document.querySelector('#appointment-dialog').close();
  resetBooking();
  renderHistory();
  goTo('inicio');
  showToast('Demonstração salva neste navegador.');
});
document.querySelector('#places-list').addEventListener('click', event => {
  const button = event.target.closest('[data-book-location]');
  if (!button) return;
  resetBooking();
  if (!activeAccount) {
    pendingBookingLocation = button.dataset.bookLocation;
    showAuth('register', 'Crie um cadastro ou entre para continuar este agendamento demonstrativo.');
    return;
  }
  booking.locationId = button.dataset.bookLocation;
  document.querySelector('#to-step-2').disabled = false;
  renderLocations(document.querySelector('#booking-location-list'), '', true);
  goTo('agendar');
});
document.querySelector('#profile-form').addEventListener('submit', event => {
  event.preventDefault();
  state.profile = {
    name: document.querySelector('#profile-name').value.trim(),
    email: document.querySelector('#profile-email').value.trim(),
    blood: document.querySelector('#profile-blood').value
  };
  saveState();
  syncProfile();
  showToast('Perfil salvo neste navegador.');
});
document.querySelector('.info-grid').addEventListener('click', event => {
  const toggle = event.target.closest('.accordion-toggle');
  if (!toggle) return;
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded));
  toggle.querySelector('span').textContent = expanded ? '＋' : '−';
});

renderLocations(document.querySelector('#booking-location-list'), '', true);
renderLocations(document.querySelector('#places-list'));
try {
  const sessionEmail = localStorage.getItem(SESSION_KEY);
  if (sessionEmail) {
    const account = readAccounts().find(item => item.email === sessionEmail);
    if (account) enterApp(account);
    else showPublicHome();
  } else {
    showPublicHome();
  }
} catch (error) {
  console.error('Não foi possível restaurar a sessão demonstrativa.', error);
  showPublicHome();
  showToast('Não foi possível restaurar a sessão salva; você pode entrar novamente.');
}
