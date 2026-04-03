import { ref } from 'vue'

const statusMessage = ref('')
const errorMessage = ref('')

export function useStatusMessage() {
  function showStatus(message, type = 'success') {
    statusMessage.value = message

    if (type === 'error') {
      errorMessage.value = message
    } else {
      errorMessage.value = ''
    }

    setTimeout(() => {
      if (statusMessage.value === message) {
        statusMessage.value = ''
      }

      if (errorMessage.value === message) {
        errorMessage.value = ''
      }
    }, 3500)
  }

  function clearStatus() {
    statusMessage.value = ''
    errorMessage.value = ''
  }

  return {
    statusMessage,
    errorMessage,
    showStatus,
    clearStatus
  }
}