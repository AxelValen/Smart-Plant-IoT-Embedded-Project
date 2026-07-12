// ================================================================
//  frontend/auth.js — Login / Registro
//
//  Hace fetch a /api/auth/login y /api/auth/register.
//  Guarda el JWT en localStorage bajo la clave 'sp_token'.
// ================================================================

const TOKEN_KEY = 'sp_token';

// ── Tabs (login / registro) ──────────────────────────────────────
const tabs = document.querySelectorAll('.auth-tab');
const forms = {
  login:    document.getElementById('loginForm'),
  register: document.getElementById('registerForm')
};

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('activo'));
    tab.classList.add('activo');

    Object.values(forms).forEach(f => f.classList.remove('activo'));
    forms[tab.dataset.tab].classList.add('activo');
  });
});

// ── Helper: muestra un mensaje dentro de un formulario ───────────
function showMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.classList.remove('error', 'success', 'visible');
  el.classList.add(type, 'visible');
}

// ── Helper: activa/desactiva el botón de submit mientras se envía ─
function setLoading(form, isLoading) {
  const btn = form.querySelector('.auth-submit');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Procesando...' : (form.id === 'loginForm' ? 'Iniciar sesión' : 'Crear cuenta');
}

// ── Login ─────────────────────────────────────────────────────────
forms.login.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  setLoading(forms.login, true);

  try {
    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage('loginMessage', data.error || 'No se pudo iniciar sesión', 'error');
      return;
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    showMessage('loginMessage', 'Sesión iniciada. Redirigiendo...', 'success');

    setTimeout(() => { window.location.href = 'home.html'; }, 600);

  } catch (err) {
    console.error('❌ Error de red en login:', err);
    showMessage('loginMessage', 'Error de conexión con el servidor', 'error');
  } finally {
    setLoading(forms.login, false);
  }
});

// ── Registro ──────────────────────────────────────────────────────
forms.register.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name      = document.getElementById('registerName').value.trim();
  const email     = document.getElementById('registerEmail').value.trim();
  const password  = document.getElementById('registerPassword').value;
  const password2 = document.getElementById('registerPassword2').value;

  if (password !== password2) {
    showMessage('registerMessage', 'Las contraseñas no coinciden', 'error');
    return;
  }

  setLoading(forms.register, true);

  try {
    const res = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage('registerMessage', data.error || 'No se pudo crear la cuenta', 'error');
      return;
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    showMessage('registerMessage', 'Cuenta creada. Redirigiendo...', 'success');

    setTimeout(() => { window.location.href = 'home.html'; }, 600);

  } catch (err) {
    console.error('❌ Error de red en registro:', err);
    showMessage('registerMessage', 'Error de conexión con el servidor', 'error');
  } finally {
    setLoading(forms.register, false);
  }
});

// ── Helper exportado implícitamente vía window para otras páginas ─
// Uso en otros scripts: fetch('/api/algo', { headers: authHeader() })
function authHeader() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = 'login.html';
}
