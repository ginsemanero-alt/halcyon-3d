import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Serves GET /__city-files in dev: a JSON list of the .gltf/.glb files in public/models/city.
// Only used when CITY_STYLE = 'lowpoly' in src/config.js.
function cityFiles() {
  return {
    name: 'city-files',
    configureServer(server) {
      server.middlewares.use('/__city-files', (req, res) => {
        const dir = path.resolve(process.cwd(), 'public/models/city');
        let files = [];
        try { files = fs.readdirSync(dir).filter((f) => /\.(gltf|glb)$/i.test(f)); } catch {}
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(files));
      });
    },
  };
}

export default defineConfig({
  plugins: [cityFiles()],
  build: { chunkSizeWarningLimit: 1500 },
});
