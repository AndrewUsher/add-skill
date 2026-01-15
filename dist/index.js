#!/usr/bin/env node

// src/index.ts
import { program } from "commander";
import * as p2 from "@clack/prompts";
import chalk from "chalk";

// src/git.ts
import simpleGit from "simple-git";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
function parseSource(input) {
  const githubTreeMatch = input.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/
  );
  if (githubTreeMatch) {
    const [, owner, repo, , subpath] = githubTreeMatch;
    return {
      type: "github",
      url: `https://github.com/${owner}/${repo}.git`,
      subpath
    };
  }
  const githubRepoMatch = input.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (githubRepoMatch) {
    const [, owner, repo] = githubRepoMatch;
    const cleanRepo = repo.replace(/\.git$/, "");
    return {
      type: "github",
      url: `https://github.com/${owner}/${cleanRepo}.git`
    };
  }
  const gitlabTreeMatch = input.match(
    /gitlab\.com\/([^/]+)\/([^/]+)\/-\/tree\/([^/]+)\/(.+)/
  );
  if (gitlabTreeMatch) {
    const [, owner, repo, , subpath] = gitlabTreeMatch;
    return {
      type: "gitlab",
      url: `https://gitlab.com/${owner}/${repo}.git`,
      subpath
    };
  }
  const gitlabRepoMatch = input.match(/gitlab\.com\/([^/]+)\/([^/]+)/);
  if (gitlabRepoMatch) {
    const [, owner, repo] = gitlabRepoMatch;
    const cleanRepo = repo.replace(/\.git$/, "");
    return {
      type: "gitlab",
      url: `https://gitlab.com/${owner}/${cleanRepo}.git`
    };
  }
  const shorthandMatch = input.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (shorthandMatch && !input.includes(":")) {
    const [, owner, repo, subpath] = shorthandMatch;
    return {
      type: "github",
      url: `https://github.com/${owner}/${repo}.git`,
      subpath
    };
  }
  return {
    type: "git",
    url: input
  };
}
async function cloneRepo(url) {
  const tempDir = await mkdtemp(join(tmpdir(), "add-skill-"));
  const git = simpleGit();
  await git.clone(url, tempDir, ["--depth", "1"]);
  return tempDir;
}
async function cleanupTempDir(dir) {
  await rm(dir, { recursive: true, force: true });
}

// src/skills.ts
import { readdir, readFile, stat } from "fs/promises";
import { join as join2, basename, dirname } from "path";
import matter from "gray-matter";
var SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];
async function hasSkillMd(dir) {
  try {
    const skillPath = join2(dir, "SKILL.md");
    const stats = await stat(skillPath);
    return stats.isFile();
  } catch {
    return false;
  }
}
async function parseSkillMd(skillMdPath) {
  try {
    const content = await readFile(skillMdPath, "utf-8");
    const { data } = matter(content);
    if (!data.name || !data.description) {
      return null;
    }
    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
      metadata: data.metadata
    };
  } catch {
    return null;
  }
}
async function findSkillDirs(dir, depth = 0, maxDepth = 5) {
  const skillDirs = [];
  if (depth > maxDepth) return skillDirs;
  try {
    if (await hasSkillMd(dir)) {
      skillDirs.push(dir);
    }
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name)) {
        const subDirs = await findSkillDirs(join2(dir, entry.name), depth + 1, maxDepth);
        skillDirs.push(...subDirs);
      }
    }
  } catch {
  }
  return skillDirs;
}
async function discoverSkills(basePath, subpath) {
  const skills = [];
  const seenNames = /* @__PURE__ */ new Set();
  const searchPath = subpath ? join2(basePath, subpath) : basePath;
  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join2(searchPath, "SKILL.md"));
    if (skill) {
      skills.push(skill);
      return skills;
    }
  }
  const prioritySearchDirs = [
    searchPath,
    join2(searchPath, "skills"),
    join2(searchPath, "skills/.curated"),
    join2(searchPath, "skills/.experimental"),
    join2(searchPath, "skills/.system"),
    join2(searchPath, ".codex/skills"),
    join2(searchPath, ".claude/skills"),
    join2(searchPath, ".opencode/skill"),
    join2(searchPath, ".cursor/skills")
  ];
  for (const dir of prioritySearchDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = join2(dir, entry.name);
          if (await hasSkillMd(skillDir)) {
            const skill = await parseSkillMd(join2(skillDir, "SKILL.md"));
            if (skill && !seenNames.has(skill.name)) {
              skills.push(skill);
              seenNames.add(skill.name);
            }
          }
        }
      }
    } catch {
    }
  }
  if (skills.length === 0) {
    const allSkillDirs = await findSkillDirs(searchPath);
    for (const skillDir of allSkillDirs) {
      const skill = await parseSkillMd(join2(skillDir, "SKILL.md"));
      if (skill && !seenNames.has(skill.name)) {
        skills.push(skill);
        seenNames.add(skill.name);
      }
    }
  }
  return skills;
}
function getSkillDisplayName(skill) {
  return skill.name || basename(skill.path);
}

// src/installer.ts
import { mkdir, cp, access, readdir as readdir2 } from "fs/promises";
import { join as join4, basename as basename2 } from "path";
import { existsSync as existsSync2 } from "fs";
import * as p from "@clack/prompts";

// src/agents.ts
import { homedir } from "os";
import { join as join3 } from "path";
import { existsSync } from "fs";
var home = homedir();
var agents = {
  opencode: {
    name: "opencode",
    displayName: "OpenCode",
    skillsDir: ".opencode/skill",
    globalSkillsDir: join3(home, ".config/opencode/skill"),
    detectInstalled: async () => {
      return existsSync(join3(home, ".config/opencode")) || existsSync(join3(home, ".claude/skills"));
    }
  },
  "claude-code": {
    name: "claude-code",
    displayName: "Claude Code",
    skillsDir: ".claude/skills",
    globalSkillsDir: join3(home, ".claude/skills"),
    detectInstalled: async () => {
      return existsSync(join3(home, ".claude"));
    }
  },
  codex: {
    name: "codex",
    displayName: "Codex",
    skillsDir: ".codex/skills",
    globalSkillsDir: join3(home, ".codex/skills"),
    detectInstalled: async () => {
      return existsSync(join3(home, ".codex"));
    }
  },
  cursor: {
    name: "cursor",
    displayName: "Cursor",
    skillsDir: ".cursor/skills",
    globalSkillsDir: join3(home, ".cursor/skills"),
    detectInstalled: async () => {
      return existsSync(join3(home, ".cursor"));
    }
  }
};
async function detectInstalledAgents() {
  const installed = [];
  for (const [type, config] of Object.entries(agents)) {
    if (await config.detectInstalled()) {
      installed.push(type);
    }
  }
  return installed;
}
function getAgentConfig(type, customDirs) {
  const config = agents[type];
  if (customDirs?.[type]) {
    return { ...config, globalSkillsDir: customDirs[type] };
  }
  return config;
}

// src/installer.ts
async function installSkillForAgent(skill, agentType, options = {}) {
  const agent = getAgentConfig(agentType, options.customDirs);
  const skillName = skill.name || basename2(skill.path);
  const targetBase = options.global ? agent.globalSkillsDir : join4(options.cwd || process.cwd(), agent.skillsDir);
  if (options.global && options.customDirs?.[agentType]) {
    if (!existsSync2(targetBase)) {
      const create = await p.confirm({
        message: `Custom global directory does not exist: ${targetBase}
Would you like to create it?`
      });
      if (p.isCancel(create)) {
        return {
          success: false,
          path: targetBase,
          error: "Installation cancelled"
        };
      }
      if (create) {
        try {
          await mkdir(targetBase, { recursive: true });
        } catch (error) {
          return {
            success: false,
            path: targetBase,
            error: error instanceof Error ? error.message : "Failed to create directory"
          };
        }
      } else {
        return {
          success: false,
          path: targetBase,
          error: "Custom directory does not exist and creation was declined"
        };
      }
    }
  }
  const targetDir = join4(targetBase, skillName);
  try {
    await mkdir(targetDir, { recursive: true });
    await copyDirectory(skill.path, targetDir);
    return { success: true, path: targetDir };
  } catch (error) {
    return {
      success: false,
      path: targetDir,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
async function copyDirectory(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir2(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join4(src, entry.name);
    const destPath = join4(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
    }
  }
}
async function isSkillInstalled(skillName, agentType, options = {}) {
  const agent = getAgentConfig(agentType, options.customDirs);
  const targetBase = options.global ? agent.globalSkillsDir : join4(options.cwd || process.cwd(), agent.skillsDir);
  const skillDir = join4(targetBase, skillName);
  try {
    await access(skillDir);
    return true;
  } catch {
    return false;
  }
}
function getInstallPath(skillName, agentType, options = {}) {
  const agent = getAgentConfig(agentType, options.customDirs);
  const targetBase = options.global ? agent.globalSkillsDir : join4(options.cwd || process.cwd(), agent.skillsDir);
  return join4(targetBase, skillName);
}

// src/index.ts
var version = "1.0.0";
program.name("add-skill").description("Install skills onto coding agents (OpenCode, Claude Code, Codex, Cursor)").version(version).argument("<source>", "Git repo URL, GitHub shorthand (owner/repo), or direct path to skill").option("-g, --global", "Install skill globally (user-level) instead of project-level").option("-a, --agent <agents...>", "Specify agents to install to (opencode, claude-code, codex, cursor)").option("-s, --skill <skills...>", "Specify skill names to install (skip selection prompt)").option("-l, --list", "List available skills in the repository without installing").option("-y, --yes", "Skip confirmation prompts").option("--global-dir-opencode <path>", "Custom global directory for OpenCode skills").option("--global-dir-claude-code <path>", "Custom global directory for Claude Code skills").option("--global-dir-codex <path>", "Custom global directory for Codex skills").option("--global-dir-cursor <path>", "Custom global directory for Cursor skills").action(async (source, options) => {
  await main(source, options);
});
program.parse();
async function main(source, options) {
  console.log();
  p2.intro(chalk.bgCyan.black(" add-skill "));
  let tempDir = null;
  const customDirs = {};
  if (options.globalDirOpencode) customDirs.opencode = options.globalDirOpencode;
  if (options.globalDirClaudeCode) customDirs["claude-code"] = options.globalDirClaudeCode;
  if (options.globalDirCodex) customDirs.codex = options.globalDirCodex;
  if (options.globalDirCursor) customDirs.cursor = options.globalDirCursor;
  try {
    const spinner2 = p2.spinner();
    spinner2.start("Parsing source...");
    const parsed = parseSource(source);
    spinner2.stop(`Source: ${chalk.cyan(parsed.url)}${parsed.subpath ? ` (${parsed.subpath})` : ""}`);
    spinner2.start("Cloning repository...");
    tempDir = await cloneRepo(parsed.url);
    spinner2.stop("Repository cloned");
    spinner2.start("Discovering skills...");
    const skills = await discoverSkills(tempDir, parsed.subpath);
    if (skills.length === 0) {
      spinner2.stop(chalk.red("No skills found"));
      p2.outro(chalk.red("No valid skills found. Skills require a SKILL.md with name and description."));
      await cleanup(tempDir);
      process.exit(1);
    }
    spinner2.stop(`Found ${chalk.green(skills.length)} skill${skills.length > 1 ? "s" : ""}`);
    if (options.list) {
      console.log();
      p2.log.step(chalk.bold("Available Skills"));
      for (const skill of skills) {
        p2.log.message(`  ${chalk.cyan(getSkillDisplayName(skill))}`);
        p2.log.message(`    ${chalk.dim(skill.description)}`);
      }
      console.log();
      p2.outro("Use --skill <name> to install specific skills");
      await cleanup(tempDir);
      process.exit(0);
    }
    let selectedSkills;
    if (options.skill && options.skill.length > 0) {
      selectedSkills = skills.filter(
        (s) => options.skill.some(
          (name) => s.name.toLowerCase() === name.toLowerCase() || getSkillDisplayName(s).toLowerCase() === name.toLowerCase()
        )
      );
      if (selectedSkills.length === 0) {
        p2.log.error(`No matching skills found for: ${options.skill.join(", ")}`);
        p2.log.info("Available skills:");
        for (const s of skills) {
          p2.log.message(`  - ${getSkillDisplayName(s)}`);
        }
        await cleanup(tempDir);
        process.exit(1);
      }
      p2.log.info(`Selected ${selectedSkills.length} skill${selectedSkills.length !== 1 ? "s" : ""}: ${selectedSkills.map((s) => chalk.cyan(getSkillDisplayName(s))).join(", ")}`);
    } else if (skills.length === 1) {
      selectedSkills = skills;
      const firstSkill = skills[0];
      p2.log.info(`Skill: ${chalk.cyan(getSkillDisplayName(firstSkill))}`);
      p2.log.message(chalk.dim(firstSkill.description));
    } else if (options.yes) {
      selectedSkills = skills;
      p2.log.info(`Installing all ${skills.length} skills`);
    } else {
      const skillChoices = skills.map((s) => ({
        value: s,
        label: getSkillDisplayName(s),
        hint: s.description.length > 60 ? s.description.slice(0, 57) + "..." : s.description
      }));
      const selected = await p2.multiselect({
        message: "Select skills to install",
        options: skillChoices,
        required: true
      });
      if (p2.isCancel(selected)) {
        p2.cancel("Installation cancelled");
        await cleanup(tempDir);
        process.exit(0);
      }
      selectedSkills = selected;
    }
    let targetAgents;
    if (options.agent && options.agent.length > 0) {
      const validAgents = ["opencode", "claude-code", "codex", "cursor"];
      const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));
      if (invalidAgents.length > 0) {
        p2.log.error(`Invalid agents: ${invalidAgents.join(", ")}`);
        p2.log.info(`Valid agents: ${validAgents.join(", ")}`);
        await cleanup(tempDir);
        process.exit(1);
      }
      targetAgents = options.agent;
    } else {
      spinner2.start("Detecting installed agents...");
      const installedAgents = await detectInstalledAgents();
      spinner2.stop(`Detected ${installedAgents.length} agent${installedAgents.length !== 1 ? "s" : ""}`);
      if (installedAgents.length === 0) {
        if (options.yes) {
          targetAgents = ["opencode", "claude-code", "codex", "cursor"];
          p2.log.info("Installing to all agents (none detected)");
        } else {
          p2.log.warn("No coding agents detected. You can still install skills.");
          const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
            value: key,
            label: config.displayName
          }));
          const selected = await p2.multiselect({
            message: "Select agents to install skills to",
            options: allAgentChoices,
            required: true
          });
          if (p2.isCancel(selected)) {
            p2.cancel("Installation cancelled");
            await cleanup(tempDir);
            process.exit(0);
          }
          targetAgents = selected;
        }
      } else if (installedAgents.length === 1 || options.yes) {
        targetAgents = installedAgents;
        if (installedAgents.length === 1) {
          const firstAgent = installedAgents[0];
          p2.log.info(`Installing to: ${chalk.cyan(agents[firstAgent].displayName)}`);
        } else {
          p2.log.info(`Installing to: ${installedAgents.map((a) => chalk.cyan(agents[a].displayName)).join(", ")}`);
        }
      } else {
        const agentChoices = installedAgents.map((a) => {
          const config = getAgentConfig(a, customDirs);
          return {
            value: a,
            label: config.displayName,
            hint: `${options.global ? config.globalSkillsDir : config.skillsDir}`
          };
        });
        const selected = await p2.multiselect({
          message: "Select agents to install skills to",
          options: agentChoices,
          required: true,
          initialValues: installedAgents
        });
        if (p2.isCancel(selected)) {
          p2.cancel("Installation cancelled");
          await cleanup(tempDir);
          process.exit(0);
        }
        targetAgents = selected;
      }
    }
    let installGlobally = options.global ?? false;
    if (options.global === void 0 && !options.yes) {
      const scope = await p2.select({
        message: "Installation scope",
        options: [
          { value: false, label: "Project", hint: "Install in current directory (committed with your project)" },
          { value: true, label: "Global", hint: "Install in home directory (available across all projects)" }
        ]
      });
      if (p2.isCancel(scope)) {
        p2.cancel("Installation cancelled");
        await cleanup(tempDir);
        process.exit(0);
      }
      installGlobally = scope;
    }
    console.log();
    p2.log.step(chalk.bold("Installation Summary"));
    for (const skill of selectedSkills) {
      p2.log.message(`  ${chalk.cyan(getSkillDisplayName(skill))}`);
      for (const agent of targetAgents) {
        const path = getInstallPath(skill.name, agent, { global: installGlobally, customDirs });
        const installed = await isSkillInstalled(skill.name, agent, { global: installGlobally, customDirs });
        const status = installed ? chalk.yellow(" (will overwrite)") : "";
        p2.log.message(`    ${chalk.dim("\u2192")} ${agents[agent].displayName}: ${chalk.dim(path)}${status}`);
      }
    }
    console.log();
    if (!options.yes) {
      const confirmed = await p2.confirm({ message: "Proceed with installation?" });
      if (p2.isCancel(confirmed) || !confirmed) {
        p2.cancel("Installation cancelled");
        await cleanup(tempDir);
        process.exit(0);
      }
    }
    spinner2.start("Installing skills...");
    const results = [];
    for (const skill of selectedSkills) {
      for (const agent of targetAgents) {
        const result = await installSkillForAgent(skill, agent, { global: installGlobally, customDirs });
        results.push({
          skill: getSkillDisplayName(skill),
          agent: agents[agent].displayName,
          ...result
        });
      }
    }
    spinner2.stop("Installation complete");
    console.log();
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    if (successful.length > 0) {
      p2.log.success(chalk.green(`Successfully installed ${successful.length} skill${successful.length !== 1 ? "s" : ""}`));
      for (const r of successful) {
        p2.log.message(`  ${chalk.green("\u2713")} ${r.skill} \u2192 ${r.agent}`);
        p2.log.message(`    ${chalk.dim(r.path)}`);
      }
    }
    if (failed.length > 0) {
      console.log();
      p2.log.error(chalk.red(`Failed to install ${failed.length} skill${failed.length !== 1 ? "s" : ""}`));
      for (const r of failed) {
        p2.log.message(`  ${chalk.red("\u2717")} ${r.skill} \u2192 ${r.agent}`);
        p2.log.message(`    ${chalk.dim(r.error)}`);
      }
    }
    console.log();
    p2.outro(chalk.green("Done!"));
  } catch (error) {
    p2.log.error(error instanceof Error ? error.message : "Unknown error occurred");
    p2.outro(chalk.red("Installation failed"));
    process.exit(1);
  } finally {
    await cleanup(tempDir);
  }
}
async function cleanup(tempDir) {
  if (tempDir) {
    try {
      await cleanupTempDir(tempDir);
    } catch {
    }
  }
}
