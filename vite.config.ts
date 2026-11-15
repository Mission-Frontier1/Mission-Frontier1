import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const nasaProxies = {
  '/api/nasa/horizons.api': {
    target: 'https://ssd.jpl.nasa.gov',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/nasa\/horizons\.api/, '/api/horizons.api'),
  },
  '/api/nasa/spice': {
    target: 'https://wgc2.jpl.nasa.gov:8443',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/nasa\/spice/, '/webgeocalc/api'),
  },
  '/api/nasa/pds/lola-gdr-catalog': {
    target: 'https://pds-geosciences.wustl.edu',
    changeOrigin: true,
    rewrite: () => '/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/gdr_ds.cat',
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: nasaProxies },
  preview: { proxy: nasaProxies },
})
