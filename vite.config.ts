import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 9000,
        watch: {
            usePolling: true,
            interval: 1000,
            binaryInterval: 1500,
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                '**/coverage/**',
                '**/.idea/**',
                '**/.vscode/**',
            ],
        },
    },
})