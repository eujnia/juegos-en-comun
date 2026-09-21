import type { ApiError, CompareResult } from '../shared/types.js';

declare global { interface Window { STEAM_API_BASE_URL?: string } }
const apiBase = (window.STEAM_API_BASE_URL ?? '').trim().replace(/\/$/, '');

const form = document.querySelector<HTMLFormElement>('#compare-form')!;
const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const profiles = document.querySelector<HTMLElement>('#profiles')!;
const addProfile = document.querySelector<HTMLButtonElement>('#add-profile')!;
const getInputs = () => [...profiles.querySelectorAll<HTMLInputElement>('input')];
const status = document.querySelector<HTMLElement>('#status')!;
const error = document.querySelector<HTMLElement>('#error')!;
const results = document.querySelector<HTMLElement>('#results')!;
const games = document.querySelector<HTMLUListElement>('#games')!;
const hours = (minutes: number) => `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(minutes / 60)} h`;

function clearResults() {
  results.hidden = true;
  error.hidden = true;
  status.textContent = '';
}

function updateProfiles() {
  const fields = [...profiles.querySelectorAll<HTMLElement>('.field')];
  fields.forEach((field, index) => {
    const input = field.querySelector('input')!;
    const label = field.querySelector('label')!;
    input.id = input.name = `user${index + 1}`;
    label.htmlFor = input.id;
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = String(index + 1).padStart(2, '0');
    label.replaceChildren(number, ` Perfil de Steam ${index + 1}`);
    const remove = field.querySelector<HTMLButtonElement>('.remove-profile')!;
    remove.hidden = fields.length <= 2;
    remove.setAttribute('aria-label', `Quitar persona ${index + 1}`);
  });
  addProfile.disabled = fields.length >= 10;
}

function enableRemove(field: HTMLElement) {
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-profile';
  remove.textContent = 'Quitar';
  remove.addEventListener('click', () => {
    field.remove();
    updateProfiles();
    clearResults();
    getInputs().at(-1)?.focus();
  });
  field.append(remove);
}

profiles.querySelectorAll<HTMLElement>('.field').forEach(enableRemove);
updateProfiles();
profiles.addEventListener('input', clearResults);
addProfile.addEventListener('click', () => {
  if (getInputs().length >= 10) return;
  const field = profiles.querySelector<HTMLElement>('.field')!.cloneNode(true) as HTMLElement;
  field.querySelector('.remove-profile')!.remove();
  const input = field.querySelector('input')!;
  input.value = '';
  input.removeAttribute('aria-invalid');
  enableRemove(field);
  profiles.append(field);
  updateProfiles();
  clearResults();
  input.focus();
});

function render(data: CompareResult) {
  document.querySelector('#results-title')!.textContent = `${data.count} ${data.count === 1 ? 'juego' : 'juegos'} en común`;
  document.querySelector('#users')!.textContent = data.users.map(user => user.name).join(' · ');
  document.querySelector('#notice')!.textContent = data.notices.join(' ') || (data.count === 0 ? 'Estas bibliotecas todavía no tienen juegos en común.' : '');
  const fragment = document.createDocumentFragment();
  for (const game of data.games) {
    const item = document.createElement('li');
    item.className = 'game';
    const icon = document.createElement('div');
    icon.className = 'game-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = game.name.charAt(0).toUpperCase();
    if (game.iconUrl) {
      const image = document.createElement('img');
      image.src = game.iconUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => { icon.textContent = game.name.charAt(0).toUpperCase(); });
      icon.replaceChildren(image);
    }
    const details = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = game.name;
    const times = document.createElement('p');
    for (const user of data.users) {
      const minutes = game.playtimes.find(time => time.steamId === user.steamId)?.minutes ?? 0;
      const time = document.createElement('span');
      time.textContent = `${user.name}: ${hours(minutes)}`;
      times.append(time);
    }
    details.append(title, times);
    item.append(icon, details);
    fragment.append(item);
  }
  games.replaceChildren(fragment);
  results.hidden = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  const inputs = getInputs();
  error.hidden = true;
  results.hidden = true;
  status.textContent = '';
  for (const input of inputs) input.setAttribute('aria-invalid', String(!input.value.trim()));
  const empty = inputs.find(input => !input.value.trim());
  if (empty) {
    error.textContent = 'Completá todos los perfiles o quitá los que no quieras comparar.';
    error.hidden = false;
    empty.focus();
    return;
  }
  button.disabled = true;
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) control.disabled = true;
  button.textContent = 'Comparando…';
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Consultando las bibliotecas de Steam…';
  const slowNotice = window.setTimeout(() => {
    status.textContent = 'El servidor está tardando en responder. Si estaba en reposo, puede demorar alrededor de un minuto…';
  }, 10000);
  try {
    const query = new URLSearchParams();
    inputs.forEach(input => query.append('user', input.value.trim()));
    const response = await fetch(`${apiBase}/api/compare?${query}`, { signal: AbortSignal.timeout(120000), credentials: 'omit' });
    const data: CompareResult | ApiError = await response.json();
    if (!response.ok || 'error' in data) {
      error.textContent = 'error' in data ? data.error.message : 'No pudimos completar la comparación. Intentá nuevamente.';
      error.hidden = false;
      return;
    }
    render(data);
    status.textContent = `Comparación completada: ${data.count} ${data.count === 1 ? 'juego' : 'juegos'} en común.`;
  } catch {
    error.textContent = 'No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente.';
    error.hidden = false;
  } finally {
    window.clearTimeout(slowNotice);
    if (error.hidden === false) status.textContent = '';
    button.disabled = false;
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) control.disabled = false;
    updateProfiles();
    button.textContent = 'Comparar ↗';
    form.setAttribute('aria-busy', 'false');
  }
});
