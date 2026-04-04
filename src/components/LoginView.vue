<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'

const emit = defineEmits(['login-success'])

const errorMessage = ref('')
const loading = ref(false)

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.10:4000'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

let googleInitialized = false

async function handleCredentialResponse(response) {
  try {
    loading.value = true
    errorMessage.value = ''

    if (!response?.credential) {
      throw new Error('Credencial do Google não recebida.')
    }

    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        credential: response.credential
      })
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data?.error || 'Falha no login.')
    }

    if (!data?.token || !data?.user) {
      throw new Error('Resposta de autenticação inválida.')
    }

    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('auth_user', JSON.stringify(data.user))

    emit('login-success', data.user)
  } catch (error) {
    errorMessage.value = error?.message || 'Erro ao autenticar.'
  } finally {
    loading.value = false
  }
}

function initGoogleLogin() {
  const googleClient = window.google?.accounts?.id
  const buttonContainer = document.getElementById('google-login-button')

  if (!googleClient || !buttonContainer) {
    errorMessage.value = 'Google Login não disponível no momento.'
    return
  }

  if (!GOOGLE_CLIENT_ID) {
    errorMessage.value = 'Google Login não configurado.'
    return
  }

  buttonContainer.innerHTML = ''

  googleClient.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true
  })

  googleClient.renderButton(buttonContainer, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    width: 280,
    logo_alignment: 'left'
  })

  googleInitialized = true
}

onMounted(() => {
  initGoogleLogin()
})

onBeforeUnmount(() => {
  const googleClient = window.google?.accounts?.id

  if (googleInitialized && googleClient) {
    googleClient.cancel()
  }
})
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand-block">
        <p class="eyebrow">Florescendo Talentos</p>
        <h1>Entrar no painel</h1>
        <p class="subtitle">
          Use seu e-mail institucional para acessar o monitor de entregas.
        </p>
      </div>

      <div class="login-box">
        <div id="google-login-button"></div>

        <p class="helper-text">
          Faça login com sua conta institucional.
        </p>

        <p v-if="loading" class="info-text">Autenticando...</p>
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(249, 115, 22, 0.10), transparent 28%),
    radial-gradient(circle at top right, rgba(34, 197, 94, 0.10), transparent 22%),
    linear-gradient(180deg, #fbf8ef 0%, #f7f3e8 100%);
}

.login-card {
  width: 100%;
  max-width: 460px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e7dcc4;
  border-radius: 28px;
  box-shadow: 0 20px 45px rgba(71, 85, 105, 0.08);
  padding: 30px;
}

.brand-block {
  text-align: center;
  margin-bottom: 26px;
}

.eyebrow {
  margin: 0 0 10px;
  color: #ea580c;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #1e3a8a;
  font-size: 2rem;
}

.subtitle {
  margin: 12px 0 0;
  color: #64748b;
  line-height: 1.5;
}

.login-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.helper-text {
  margin: 0;
  color: #64748b;
  font-size: 0.92rem;
  text-align: center;
}

.info-text {
  margin: 0;
  color: #64748b;
  font-weight: 600;
}

.error-text {
  margin: 0;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 12px 14px;
  border-radius: 14px;
  width: 100%;
  text-align: center;
  font-weight: 600;
  line-height: 1.45;
}
</style>