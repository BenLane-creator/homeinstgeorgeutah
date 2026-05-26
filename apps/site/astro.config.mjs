import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [react()],
	vite: {
		plugins: [tailwindcss()],
		server: {
			proxy: {
				"/api": {
					target: "http://localhost:8787",
					changeOrigin: true,
				},
			},
		},
	},
	output: "static",
	trailingSlash: "always",
});
