const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not defined');
}

export const API_CONFIG = {
    BASE_URL: API_BASE_URL,
    GOOGLE_OAUTH_URL: `${API_BASE_URL}/auth/google`,
    LOGIN_SUCCESS_URL: '/dashboard',
    LOGIN_FAILURE_URL: '/login?error=true',
} as const;


// Google Console OAuth Configuration (for reference only)
// Local redirect URI: http://localhost:8888/v1/login/oauth2/code/google
// Prod redirect URI: https://api.famsub.almonium.com/v1/login/oauth2/code/google
