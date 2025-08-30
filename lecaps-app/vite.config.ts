import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: 'DBLecaps', // 👈 si el repo se llama "lecaps-app", poné '/lecaps-app/'
})

