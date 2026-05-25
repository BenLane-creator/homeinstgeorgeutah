import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const neighborhoods = defineCollection({
	loader: glob({
		pattern: "**/*.{md,mdx}",
		base: "./src/content/neighborhoods",
	}),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		slug: z.string().optional(),
	}),
});

const blog = defineCollection({
	loader: glob({
		pattern: "**/*.{md,mdx}",
		base: "./src/content/blog",
	}),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		slug: z.string().optional(),
		pubDate: z.coerce.date().optional(),
		author: z.string().optional(),
		category: z.string().optional(),
	}),
});

export const collections = {
	neighborhoods,
	blog,
};
