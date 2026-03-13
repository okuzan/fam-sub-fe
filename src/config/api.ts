export const API_CONFIG = {
  BASE_URL: import.meta.env.PROD 
    ? 'https://api.famsub.almonium.com/v1'
    : 'http://localhost:8888/v1',
  
  GOOGLE_OAUTH_URL: import.meta.env.PROD
    ? 'https://api.famsub.almonium.com/v1/auth/google'
    : 'http://localhost:8888/v1/auth/google',
    
  LOGIN_SUCCESS_URL: '/dashboard',
  LOGIN_FAILURE_URL: '/login?error=true'
};

export const GOOGLE_OAUTH_CONFIG = {
  CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  REDIRECT_URI: import.meta.env.PROD
    ? 'https://api.famsub.almonium.com/v1/auth/google/callback'
    : 'http://localhost:8888/v1/auth/google/callback',
  SCOPE: 'openid email profile'
};
