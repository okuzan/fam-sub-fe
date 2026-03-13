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

// Google Console OAuth Configuration (for reference only)
// Local redirect URI: http://localhost:8888/v1/login/oauth2/code/google
// Prod redirect URI: https://api.famsub.almonium.com/v1/login/oauth2/code/google
