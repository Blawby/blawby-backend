import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/hono-server.ts', 'src/workers/*.worker.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  minify: false,
  outDir: 'dist',
  bundle: true, // Always bundle for optimal production builds
  tsconfig: 'tsconfig.json',
  splitting: false,
  shims: true,
  treeshake: false, // Disabled for backend - tree-shaking is for frontend bundle size optimization
  outExtension() {
    return {
      js: '.js',
    };
  },
});

