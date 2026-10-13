export const CONFIG = {
  WS_URL:  'wss://revers-mesendger.onrender.com/ws',
  API_URL: 'https://revers-mesendger.onrender.com',

  RECONNECT_DELAY: 3000,
  RECONNECT_MAX_ATTEMPTS: 20,
  TYPING_TIMEOUT: 2000,
  SCROLL_THRESHOLD: 60,

  LIMITS: {
    MESSAGE_MAX_LENGTH: 4000,
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 32,
    PASSWORD_MIN_LENGTH: 6,
    PASSWORD_MAX_LENGTH: 128
  }
};
