import { readFileSync } from "node:fs";

const [expectedProject, inputPath] = process.argv.slice(2);

if (!expectedProject || !inputPath) {
  throw new Error(
    "Usage: bun scripts/verify-pages-project-list.mjs <expected-project> <pages-projects.json>",
  );
}

const payload = JSON.parse(readFileSync(inputPath, "utf8"));
const projects = Array.isArray(payload)
  ? payload
  : Array.isArray(payload?.result)
    ? payload.result
    : [];

const projectNames = projects
  .map((project) =>
    String(
      project?.name ??
        project?.["Project Name"] ??
        project?.project_name ??
        project?.projectName ??
        "",
    ).trim(),
  )
  .filter(Boolean);

if (!projectNames.includes(expectedProject)) {
  throw new Error(
    `Cloudflare Pages project ${expectedProject} was not found. Visible projects: ${
      projectNames.length > 0 ? projectNames.join(", ") : "none"
    }`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      expectedProject,
      visibleProjectNames: projectNames,
    },
    null,
    2,
  ),
);
