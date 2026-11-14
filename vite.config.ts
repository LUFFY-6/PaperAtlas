import { defineConfig, loadEnv } from 'vite'
import { endpoints } from './server/reader.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DASHSCOPE_')
  const api = endpoints({
    key: env.DASHSCOPE_API_KEY ?? '',
    base: env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: env.DASHSCOPE_MODEL || 'qwen-plus',
  })
  return { esbuild: { jsx: 'automatic' }, plugins: [{
    name: 'paper-atlas-api',
    configureServer(server) { server.middlewares.use(api) },
    configurePreviewServer(server) { server.middlewares.use(api) },
  }] }
})
