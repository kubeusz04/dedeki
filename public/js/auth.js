// ===== Auth Module =====
const Auth = {
  init() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        const formId = tab.dataset.tab === 'login' ? 'login-form' : 'register-form';
        document.getElementById(formId).classList.add('active');
      });
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      try {
        const data = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('login-username').value.trim(),
            password: document.getElementById('login-password').value
          })
        });
        setToken(data.token);
        setUser(data.user);
        App.onLogin(data.user);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('register-error');
      errEl.textContent = '';
      try {
        const data = await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('reg-username').value.trim(),
            email: document.getElementById('reg-email').value.trim(),
            displayName: document.getElementById('reg-display-name').value.trim() || undefined,
            password: document.getElementById('reg-password').value
          })
        });
        setToken(data.token);
        setUser(data.user);
        App.onLogin(data.user);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // Logout button
    document.getElementById('btn-logout').addEventListener('click', () => {
      Auth.logout();
    });
  },

  logout() {
    removeToken();
    removeUser();
    if (App.socket) {
      App.socket.disconnect();
      App.socket = null;
    }
    showScreen('auth-screen');
    showToast('Wylogowano', 'info');
  },

  checkSession() {
    const token = getToken();
    const user = getUser();
    if (token && user) {
      return user;
    }
    return null;
  }
};
